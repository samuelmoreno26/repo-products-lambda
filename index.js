const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");

const dynamoClient = new DynamoDBClient({});
const Sentry = require("@sentry/aws-serverless");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});
Sentry.setTag("module", "productos");
Sentry.setTag("team", "backend");

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

const BUCKET = process.env.BUCKET_IMAGES;
const TABLE = process.env.TABLE_PRODUCTOS;

exports.handler = Sentry.wrapHandler(async (event) => {
    try {
        const method = event.requestContext?.http?.method || event.httpMethod;
        const body = event.body ? JSON.parse(event.body) : {};
        
        const headers = { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        };

        if (method === "POST") {
            // Add new product
            const { name, category, price, imageBase64, imageMime } = body;
            const productId = randomUUID();
            let imageUrl = null;
            let imageKey = null;

            if (imageBase64 && imageMime) {
                // Quitar encabezado base64 si viene (ej. data:image/png;base64,...)
                const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const extension = imageMime.split('/')[1] || 'jpg';
                imageKey = `products/${productId}.${extension}`;
                
                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: imageKey,
                    Body: buffer,
                    ContentType: imageMime
                }));
                
                if (process.env.CLOUDFRONT_DOMAIN) {
                    imageUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${imageKey}`;
                } else {
                    imageUrl = `https://${BUCKET}.s3.amazonaws.com/${imageKey}`;
                }
            }

            const item = {
                product_id: productId,
                name,
                category,
                price: parseFloat(price),
                imageUrl,
                imageKey,
                createdAt: new Date().toISOString()
            };

            await docClient.send(new PutCommand({
                TableName: TABLE,
                Item: item
            }));

            return { statusCode: 201, headers, body: JSON.stringify({ message: "Producto creado", product: item }) };
        } 
        
        if (method === "DELETE") {
            const { product_id, imageKey } = body;
            
            if (imageKey) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: BUCKET,
                        Key: imageKey
                    }));
                } catch(e) { console.error("Error deleting image from S3", e); }
            }

            await docClient.send(new DeleteCommand({
                TableName: TABLE,
                Key: { product_id }
            }));

            return { statusCode: 200, headers, body: JSON.stringify({ message: "Producto eliminado" }) };
        }

        if (method === "PUT") {
            const { product_id, name, category, price, imageBase64, imageMime, oldImageKey, oldImageUrl } = body;
            
            if (!product_id) {
                return { statusCode: 400, headers, body: JSON.stringify({ message: "Se requiere product_id para actualizar" }) };
            }

            let imageUrl = oldImageUrl;
            let imageKey = oldImageKey;

            if (imageBase64 && imageMime) {
                const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const extension = imageMime.split('/')[1] || 'jpg';
                imageKey = `products/${product_id}.${extension}`;
                
                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: imageKey,
                    Body: buffer,
                    ContentType: imageMime
                }));
                
                if (process.env.CLOUDFRONT_DOMAIN) {
                    imageUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${imageKey}`;
                } else {
                    imageUrl = `https://${BUCKET}.s3.amazonaws.com/${imageKey}`;
                }

                // Borrar la imagen anterior si la extensión cambió
                if (oldImageKey && oldImageKey !== imageKey) {
                    try {
                        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldImageKey }));
                    } catch(e) { console.error("Error deleting old image", e); }
                }
            }

            const item = {
                product_id,
                name,
                category,
                price: parseFloat(price),
                imageUrl,
                imageKey,
                updatedAt: new Date().toISOString()
            };

            await docClient.send(new PutCommand({
                TableName: TABLE,
                Item: item
            }));

            return { statusCode: 200, headers, body: JSON.stringify({ message: "Producto actualizado", product: item }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: "Método no permitido" }) };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Error interno del servidor.", error: error.message })
        };
    }
});
