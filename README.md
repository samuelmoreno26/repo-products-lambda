# Lambda Productos - Microservicio

Este microservicio se encarga de subir imágenes directamente a Amazon S3 y registrar los datos del producto en DynamoDB, devolviendo la URL apuntada al CDN (Amazon CloudFront).

## Pipeline CI/CD
El `.github/workflows/deploy.yml` despliega el código independientemente de la infraestructura, garantizando entregas continuas sin afectar las bases de datos ni el bucket.

## Secretos Requeridos:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
