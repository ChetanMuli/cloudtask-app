pipeline {
    agent any

    environment {
        APP_NAME   = 'cloudtask-app'
        DEPLOY_DIR = "/home/${EC2_USER}/cloudtask-app"
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

        // Optional: add real tests here, e.g. `npm test`
        stage('Test') {
            steps {
                sh 'echo "No automated tests configured yet — add npm test here."'
            }
        }

        stage('Package') {
            steps {
                sh '''
                  rm -f ${APP_NAME}.tar.gz
                  tar --exclude="node_modules" --exclude=".git" -czf ${APP_NAME}.tar.gz .
                '''
                archiveArtifacts artifacts: "${APP_NAME}.tar.gz", fingerprint: true
            }
        }

        stage('Deploy to EC2') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh '''
                        # Copy the packaged build to the EC2 instance
                        scp -o StrictHostKeyChecking=no ${APP_NAME}.tar.gz ${EC2_USER}@${EC2_HOST}:/tmp/${APP_NAME}.tar.gz

                        ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} '
                            set -e
                            mkdir -p '"${DEPLOY_DIR}"'
                            tar -xzf /tmp/'"${APP_NAME}"'.tar.gz -C '"${DEPLOY_DIR}"'
                            cd '"${DEPLOY_DIR}"'
                            npm ci --production

                            if [ ! -f .env ]; then
                                echo "WARNING: .env missing on server - create it once manually before first deploy."
                            fi

                            npm run migrate || true

                            pm2 startOrRestart ecosystem.config.js --env production
                            pm2 save
                        '
                    '''
                }
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                  sleep 5
                  curl -sf http://${EC2_HOST}:3000/health || (echo "Health check failed" && exit 1)
                '''
            }
        }
    }

    post {
        success {
            echo "✅ Deployed ${APP_NAME} to ${EC2_HOST} successfully."
        }
        failure {
            echo "❌ Deployment failed — check the stage logs above."
        }
        always {
            cleanWs()
        }
    }
}
