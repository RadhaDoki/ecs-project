# ClearList Todo App

A container-ready todo application with email + dummy OTP login and MySQL persistence.

## Features

- Login with an email address and dummy OTP `123456`
- User records stored in MySQL
- Create, edit, complete, and delete todos
- JWT-protected API
- Docker Compose is included for optional local development
- Jenkins declarative pipeline for building, pushing to ECR, and restarting three ECS services

For the architecture diagram and ECS concepts reference, open [deployment-guide.html](deployment-guide.html) in a browser.

## API

- `POST /api/auth/login` body: `{ "email": "user@example.com", "otp": "123456" }`
- `GET /api/todos`
- `POST /api/todos` body: `{ "title": "First todo" }`
- `PUT /api/todos/:id` body: `{ "title": "Updated", "completed": true }`
- `DELETE /api/todos/:id`
- `GET /health`

Todo endpoints require `Authorization: Bearer <token>`.

## ECS deployment

Create these Jenkins credentials/values before using `Jenkinsfile`:

- `aws-credentials`: Jenkins AWS credential with ECR push and ECS deployment permissions
- `aws-region`: secret text containing your AWS region, for example `us-east-1`
- `ecr-registry`: secret text containing the registry host, for example `123456789012.dkr.ecr.us-east-1.amazonaws.com`

Create three ECS services in the same ECS cluster and VPC:

1. `todo-frontend-service` using the `todo-frontend` image built from `frontend/Dockerfile`. For testing, assign the task a public IP and allow inbound TCP `80` from your test network.
2. `todo-service` using the `todo-app` image. Keep it internal on container port `3000`.
3. `todo-mysql-service` using the `todo-mysql` image built from `mysql/Dockerfile`.

Enable ECS Service Connect or Cloud Map service discovery in the same namespace for `todo-service` and `todo-mysql-service`. The Nginx configuration uses `todo-service:3000`; the backend uses `mysql.todo.local:3306`. Allow TCP port `3000` from the frontend security group to the backend security group and TCP port `3306` from the backend security group to the MySQL security group.

The MySQL task must mount an EFS volume at `/var/lib/mysql`; otherwise database data is lost when the ECS task is replaced. The first MySQL task startup runs `init.sql` from the image and creates the `todo_app` schema. Do not scale the MySQL service above one task unless you move the database to RDS.

The app ECS task definition should provide these environment variables:

- `DB_HOST`: `mysql.todo.local`
- `DB_PORT`: `3306`
- `DB_NAME`: `todo_app`
- `DB_USER`: `admin`
- `DB_PASSWORD`: `admin`
- `JWT_SECRET`: a strong production secret
- `DUMMY_OTP`: `123456`

The MySQL ECS task definition should provide:

- `MYSQL_DATABASE`: `todo_app`
- `MYSQL_USER`: `admin`
- `MYSQL_PASSWORD`: `admin`
- `MYSQL_ROOT_PASSWORD`: `admin`

The Jenkins pipeline builds and pushes all three ECR images, redeploys `todo-mysql-service` first, then `todo-service`, and finally `todo-frontend-service`.

### Jenkins deployment readiness

The repository is ready for Jenkins deployment when the following prerequisites are configured:

- Jenkins agent has Docker and AWS CLI installed.
- Jenkins agent can authenticate to Docker and access AWS.
- ECR repositories exist: `todo-frontend`, `todo-app`, and `todo-mysql`.
- ECS cluster exists: `todo-cluster`.
- ECS services exist: `todo-frontend-service`, `todo-service`, and `todo-mysql-service`.
- Jenkins credentials exist with the exact IDs `aws-credentials`, `aws-region`, and `ecr-registry`.
- The ECS service discovery names are `todo-service` for the backend and `mysql.todo.local` for MySQL.
- MySQL has an EFS volume mounted at `/var/lib/mysql`.
- Security groups allow frontend to backend on TCP `3000` and backend to MySQL on TCP `3306`.

Start the Jenkins job with the `IMAGE_TAG` parameter, for example `1.0.0`. The pipeline builds all three images, pushes them to ECR, and updates the ECS services in dependency order. No local Docker test is required for this deployment flow.

### Create manually before the first pipeline run

Create these AWS and Jenkins resources manually. The current pipeline expects them to already exist; it does not create infrastructure.

1. **AWS networking:** Create or choose a VPC, private subnets for the backend and MySQL, and a public subnet for the frontend. Configure route tables and internet access for the public frontend subnet.
2. **Security groups:** Allow TCP `80` to the frontend security group from your test network. Allow TCP `3000` from frontend to backend and TCP `3306` from backend to MySQL. Do not expose `3000` or `3306` to the internet.
3. **ECR repositories:** Create `todo-frontend`, `todo-app`, and `todo-mysql` in the configured AWS region.
4. **ECS cluster:** Create the `todo-cluster` ECS cluster.
5. **ECS task execution role:** Create an execution role with `AmazonECSTaskExecutionRolePolicy` so Fargate can pull from ECR and write logs to CloudWatch.
6. **ECS task definitions:** Register task definitions for the frontend, backend, and MySQL images. Set frontend port `80`, backend port `3000`, and MySQL port `3306`.
7. **MySQL storage:** Create an EFS file system and mount targets in the ECS subnets. Add an EFS volume to the MySQL task definition mounted at `/var/lib/mysql`.
8. **Service discovery:** Create one private DNS namespace and register the backend as `todo-service` and MySQL as `mysql`. The resulting MySQL hostname must be `mysql.todo.local`.
9. **ECS services:** Create `todo-mysql-service`, `todo-service`, and `todo-frontend-service` in `todo-cluster`, using the matching task definitions and service-discovery configuration.
10. **Frontend testing access:** For no-ALB testing, set the frontend service to `assignPublicIp: ENABLED`, desired count `1`, and attach the frontend security group. Use the task public IP after deployment.
11. **Jenkins agent:** Use a Linux Jenkins agent with Docker, AWS CLI, and permission to run Docker commands. The Jenkins Pipeline and AWS Credentials Binding plugins must be installed.
12. **Jenkins credentials:** Add `aws-credentials` as an AWS credential, `aws-region` as secret text, and `ecr-registry` as secret text containing only the ECR registry hostname.

### ECS subnet and public IP configuration

Use the following network placement:

| Service | Subnet | Public IP |
| --- | --- | --- |
| `todo-frontend-service` | Public subnet | Enabled |
| `todo-service` | Private subnet | Disabled |
| `todo-mysql-service` | Private subnet | Disabled |

The frontend is the only public entry point and listens on port `80`. Allow inbound TCP `80` only from the required test network. Allow backend TCP `3000` only from the frontend security group, and allow MySQL TCP `3306` only from the backend security group. Never expose MySQL directly to the internet.

Private backend and MySQL tasks need a NAT Gateway or suitable VPC endpoints to pull images from ECR and send logs to CloudWatch. EFS mount targets should be available in the private subnets. For a temporary test without NAT, backend and MySQL may be placed in public subnets, but keep `assignPublicIp: DISABLED` and do not add inbound internet rules for ports `3000` or `3306`.

The task definitions must contain the environment variables listed below before the services are created. The pipeline only forces new deployments; it does not register task definitions or change their environment variables, networking, volumes, or service-discovery settings.

### No-ALB testing setup

Create `todo-frontend-service` with desired count `1`, `assignPublicIp: ENABLED`, and container port mapping `80`. After deployment, open the task's public IP in a browser. The public IP can change whenever ECS replaces the task, so this setup is intended for testing only. Keep the backend and MySQL tasks private; their security groups should allow frontend-to-backend traffic on `3000` and backend-to-MySQL traffic on `3306`.

For production, use Secrets Manager or SSM Parameter Store for database credentials and `JWT_SECRET`. The Compose credentials are intentionally the requested testing values only.
