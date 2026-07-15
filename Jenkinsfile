pipeline {
    agent any

    environment {
        APP_NAME   = 'cloudtask-app'
        DEPLOY_DIR = '/var/lib/jenkins/cloudtask-app'
    }

    parameters {
        string(name: 'BRANCH', defaultValue: 'main', description: 'Git branch to deploy')
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: "${params.BRANCH}",
                    url: "${env.REPO_URL}",
                    credentialsId: 'github-creds'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Syntax / Build Check') {
            steps {
                sh '''
                  node --check server.js
                  node --check config/db.js
                  node --check config/s3.js
                  node --check routes/tasks.js
                  node --check scripts/migrate.js
                '''
            }
        }

        stage('Test') {
            steps {
                sh 'echo "No automated tests configured yet — add npm test here."'
            }
        }

        stage('Deploy locally') {
            steps {
                sh '''
                    set -e
                    mkdir -p "${DEPLOY_DIR}"
                    rsync -a --exclude=".env" --exclude=".git" ./ "${DEPLOY_DIR}/"
                    cd "${DEPLOY_DIR}"

                    if [ ! -f .env ]; then
                        echo "WARNING: .env missing in ${DEPLOY_DIR} - create it once manually before first deploy."
                        exit 1
                    fi

                    npm ci --production
                    npm run migrate || true
                    pm2 startOrRestart ecosystem.config.js --env production
                    pm2 save
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                  sleep 5
                  curl -sf http://localhost:3000/health || (echo "Health check failed" && exit 1)
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Deployed ${APP_NAME} locally and restarted via PM2."
        }
        failure {
            echo "❌ Deployment failed — check the stage logs above."
        }
        always {
            cleanWs()
        }
    }
}
