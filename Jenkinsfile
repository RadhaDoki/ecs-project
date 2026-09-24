pipeline {
  agent any

  parameters {
    string(name: 'IMAGE_TAG', defaultValue: 'latest', description: 'Docker image tag')
  }

  environment {
    AWS_DEFAULT_REGION = credentials('aws-region')
    ECR_REPOSITORY = 'todo-app'
    MYSQL_ECR_REPOSITORY = 'todo-mysql'
    FRONTEND_ECR_REPOSITORY = 'todo-frontend'
    ECR_REGISTRY = credentials('ecr-registry')
    ECS_CLUSTER = 'todo-cluster'
    ECS_SERVICE = 'todo-service'
    MYSQL_ECS_SERVICE = 'todo-mysql-service'
    FRONTEND_ECS_SERVICE = 'todo-frontend-service'
    IMAGE_URI = "${ECR_REGISTRY}/${ECR_REPOSITORY}:${params.IMAGE_TAG}"
    MYSQL_IMAGE_URI = "${ECR_REGISTRY}/${MYSQL_ECR_REPOSITORY}:${params.IMAGE_TAG}"
    FRONTEND_IMAGE_URI = "${ECR_REGISTRY}/${FRONTEND_ECR_REPOSITORY}:${params.IMAGE_TAG}"
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Validate') {
      steps {
        sh 'docker build --tag todo-app:${IMAGE_TAG} .'
        sh 'docker build --file mysql/Dockerfile --tag todo-mysql:${IMAGE_TAG} .'
        sh 'docker build --file frontend/Dockerfile --tag todo-frontend:${IMAGE_TAG} .'
        sh 'docker run --rm todo-app:${IMAGE_TAG} node --check server.js'
      }
    }

    stage('Push image') {
      steps {
        withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-credentials']]) {
          sh 'aws ecr get-login-password --region ${AWS_DEFAULT_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}'
          sh 'docker tag todo-app:${IMAGE_TAG} ${IMAGE_URI}'
          sh 'docker tag todo-mysql:${IMAGE_TAG} ${MYSQL_IMAGE_URI}'
          sh 'docker tag todo-frontend:${IMAGE_TAG} ${FRONTEND_IMAGE_URI}'
          sh 'docker push ${IMAGE_URI}'
          sh 'docker push ${MYSQL_IMAGE_URI}'
          sh 'docker push ${FRONTEND_IMAGE_URI}'
        }
      }
    }

    stage('Deploy ECS service') {
      steps {
        withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-credentials']]) {
          sh 'aws ecs update-service --cluster ${ECS_CLUSTER} --service ${MYSQL_ECS_SERVICE} --force-new-deployment --region ${AWS_DEFAULT_REGION}'
          sh 'aws ecs wait services-stable --cluster ${ECS_CLUSTER} --services ${MYSQL_ECS_SERVICE} --region ${AWS_DEFAULT_REGION}'
          sh 'aws ecs update-service --cluster ${ECS_CLUSTER} --service ${ECS_SERVICE} --force-new-deployment --region ${AWS_DEFAULT_REGION}'
          sh 'aws ecs wait services-stable --cluster ${ECS_CLUSTER} --services ${ECS_SERVICE} --region ${AWS_DEFAULT_REGION}'
          sh 'aws ecs update-service --cluster ${ECS_CLUSTER} --service ${FRONTEND_ECS_SERVICE} --force-new-deployment --region ${AWS_DEFAULT_REGION}'
          sh 'aws ecs wait services-stable --cluster ${ECS_CLUSTER} --services ${FRONTEND_ECS_SERVICE} --region ${AWS_DEFAULT_REGION}'
        }
      }
    }
  }

  post {
    always { sh 'docker image prune --force || true' }
  }
}
