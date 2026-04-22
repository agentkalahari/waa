Cloud deployment (quick)

1) Build Docker image locally:

```bash
docker build -t tupi-drrm:latest .
```

2) Run with environment variables (example using AWS S3):

```bash
docker run -e S3_BUCKET=your-bucket -e AWS_ACCESS_KEY_ID=xxx -e AWS_SECRET_ACCESS_KEY=yyy -e AWS_REGION=us-east-1 -p 3000:3000 tupi-drrm:latest
```

3) Deploy to a cloud provider (Render/Railway/DigitalOcean): push image or connect GitHub repository and set env vars.

Notes:
- If you don't want to use S3, omit S3 env vars and the server will use local `uploads/` and `data/` directories.
- Ensure you set `PORT` if your platform exposes a different port.

GitHub Actions (optional)

1) Push this repo to GitHub.
2) The workflow at `.github/workflows/docker-build-publish.yml` builds and pushes the image to GitHub Container Registry (`ghcr.io`).
3) You can then deploy the container on your cloud host (Render/DigitalOcean/EC2) using the pushed image.

Security

- Do NOT commit real AWS credentials. Use repository secrets or your cloud platform's secret manager.
- Use HTTPS / cloud provider TLS termination for production.
