# ☁️ CloudTask Manager

A small full-stack task manager built to **learn AWS CI/CD**: Node.js + Express
backend, MySQL on **RDS**, file attachments in **S3**, running on an **EC2**
instance with an **IAM role** attached (no hardcoded AWS keys), deployed
automatically via **GitHub Actions**.

---

## 1. What's inside

```
cloudtask-app/
├── server.js                 # Express entrypoint
├── config/
│   ├── db.js                 # MySQL (RDS) connection pool
│   └── s3.js                 # S3 client (uses EC2 IAM role credentials)
├── routes/
│   └── tasks.js               # CRUD API + file upload to S3
├── scripts/
│   └── migrate.js            # Runs sql/schema.sql against RDS
├── sql/
│   └── schema.sql            # DB schema + sample seed data
├── public/                   # Static frontend (HTML/CSS/JS)
├── iam/
│   └── ec2-s3-policy.json    # IAM policy to attach to the EC2 role
├── ecosystem.config.js       # PM2 process manager config
├── .github/workflows/deploy.yml  # CI/CD pipeline (GitHub Actions → EC2)
├── .env.example
└── package.json
```

**API endpoints**

| Method | Route              | Description                        |
|--------|--------------------|------------------------------------|
| GET    | `/api/tasks`       | List all tasks                     |
| GET    | `/api/tasks/:id`   | Get one task                       |
| POST   | `/api/tasks`       | Create task (`attachment` optional)|
| PUT    | `/api/tasks/:id`   | Update task                        |
| DELETE | `/api/tasks/:id`   | Delete task (+ its S3 file)        |
| GET    | `/health`          | Health check                       |

---

## 2. AWS setup (do this once)

### 2.1 Create the RDS MySQL database
1. RDS Console → **Create database** → Engine: MySQL (8.0) → Templates: Free tier (for learning).
2. Set **DB instance identifier**, master username (e.g. `admin`), and a strong password.
3. Under **Connectivity**: put it in the same VPC as your EC2 instance, and for learning purposes you can set "Public access: No" (recommended) as long as EC2 is in the same VPC.
4. Note the resulting **endpoint** (looks like `xxxx.xxxxx.ap-south-1.rds.amazonaws.com`) — you'll put this in `.env` as `DB_HOST`.
5. **Security group**: edit the RDS security group's inbound rules to allow **MySQL/Aurora (3306)** from the EC2 instance's security group (not from `0.0.0.0/0`).

### 2.2 Create the S3 bucket
1. S3 Console → **Create bucket** → give it a globally-unique name (e.g. `cloudtask-yourname-2026`).
2. Keep "Block all public access" **ON** — the app fetches files via signed/direct S3 URLs; it doesn't require a public bucket. (If you want attachments viewable via plain URL without extra logic, you can make just the `attachments/*` prefix public via a bucket policy — optional, not required for the app to work.)
3. Note the bucket name for `.env` → `S3_BUCKET_NAME`.

### 2.3 Create the IAM Role for EC2 (this is the key learning piece)
1. IAM Console → **Roles** → **Create role** → Trusted entity: **AWS service** → Use case: **EC2**.
2. Attach a policy — either the AWS managed `AmazonS3FullAccess` (fine for learning) **or**, better, create a custom least-privilege policy using [`iam/ec2-s3-policy.json`](./iam/ec2-s3-policy.json) in this repo (replace `YOUR-BUCKET-NAME` with your real bucket name first).
3. Name the role, e.g. `CloudTaskEC2Role`, and create it.
4. You'll attach this role to EC2 in the next step — this is what lets the app talk to S3 with **zero hardcoded credentials**.

### 2.4 Launch the EC2 instance
1. EC2 Console → **Launch instance** → Amazon Linux 2023 or Ubuntu 22.04, `t2.micro` (free tier).
2. **IAM instance profile**: select the `CloudTaskEC2Role` you just created — this is the step the prompt asked for ("attach IAM role to EC2").
3. Security group inbound rules: allow **SSH (22)** from your IP, and **HTTP (3000 or 80)** from anywhere (`0.0.0.0/0`) if you want the app publicly reachable.
4. Launch with a key pair you have access to (needed for SSH + the CI/CD secret).

### 2.5 Install prerequisites on the EC2 instance
SSH in, then run:
```bash
# Node.js 18 (NodeSource) — Ubuntu example
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs git

# PM2 (process manager, keeps the app running & restarts on crash)
sudo npm install -g pm2
pm2 startup   # follow the printed instructions to enable pm2 on reboot
```

### 2.6 First deploy (manual, before CI/CD takes over)
```bash
git clone <your-repo-url> cloudtask-app
cd cloudtask-app
npm ci --production
cp .env.example .env
nano .env   # fill in DB_HOST, DB_PASSWORD, S3_BUCKET_NAME, etc.

npm run migrate       # creates DB + tables on RDS
pm2 start ecosystem.config.js --env production
pm2 save
```
Visit `http://<EC2-public-ip>:3000` — you should see the CloudTask UI.

> If you want it on port 80 without root, either run behind Nginx as a reverse proxy, or set `PORT=80` and run PM2 with sudo — Nginx is the recommended approach for a "real" setup.

---

## 3. Setting up CI/CD (GitHub Actions → EC2)

This repo includes [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).
On every push to `main`, it SSHes into your EC2 instance, pulls the latest
code, reinstalls dependencies, re-runs the (idempotent) migration, and
restarts the app with PM2.

**Add these secrets** in your GitHub repo → Settings → Secrets and variables → Actions:

| Secret name    | Value                                                     |
|-----------------|------------------------------------------------------------|
| `EC2_HOST`      | Public IP or DNS of your EC2 instance                     |
| `EC2_USER`      | SSH username (`ubuntu` for Ubuntu AMIs, `ec2-user` for AL2023) |
| `EC2_SSH_KEY`   | The full contents of your `.pem` private key              |
| `REPO_URL`      | This repo's clone URL (used only if `cloudtask-app` dir doesn't exist yet on the server) |

Push to `main` and watch the **Actions** tab — that's your CI/CD pipeline running end-to-end.

> **Prefer Jenkins instead?** This repo also includes a ready-to-use
> `Jenkinsfile` plus a full walkthrough in
> [`JENKINS_DEPLOY.md`](./JENKINS_DEPLOY.md) — setting up the Jenkins
> server, plugins, credentials, and the pipeline job step by step. You can
> use either GitHub Actions or Jenkins (or both).

---

## 4. Local development (optional, before touching AWS)

```bash
npm install
cp .env.example .env   # point at a local MySQL or a test RDS instance
npm run migrate
npm run dev             # nodemon, auto-restarts on file changes
```
For local S3 testing without an IAM role, uncomment and fill in
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in `.env` (use an IAM **user**
with the same S3 policy, just for local testing — never use long-lived keys
on EC2 itself).

---

## 5. Why this app is a good CI/CD learning project

- **Separation of concerns**: `config/db.js` and `config/s3.js` isolate AWS
  integration so you can see exactly where credentials/config are read.
- **IAM role instead of access keys**: `config/s3.js` shows how EC2 IAM roles
  eliminate the need for hardcoded secrets — a core AWS best practice.
- **Idempotent migrations**: `sql/schema.sql` uses `CREATE IF NOT EXISTS`, so
  re-running it in every CI/CD deploy is always safe.
- **Process management**: `ecosystem.config.js` (PM2) keeps the app alive
  across deploys and instance reboots.
- **A real pipeline**: `.github/workflows/deploy.yml` gives you a working,
  editable example of build → (test) → deploy stages to extend later (e.g.
  add CodeDeploy, Docker, blue/green deploys, etc.)

## 6. Suggested next steps once this works

- Put the app behind an **Application Load Balancer** + **Auto Scaling Group**.
- Move secrets (`DB_PASSWORD`, etc.) into **AWS Secrets Manager** instead of `.env`.
- Add **CloudWatch** logging/alarms.
- Replace the SSH-based deploy with **AWS CodeDeploy** or **CodePipeline** for a fully AWS-native CI/CD story.
