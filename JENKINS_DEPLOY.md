# 🔧 Deploying CloudTask with Jenkins (CI/CD)

This guide replaces (or complements) the GitHub Actions workflow with a
**Jenkins pipeline**. It assumes two separate things on AWS:

- **Jenkins server** — where the pipeline runs (build, test, package). Can be
  its own EC2 instance, or Jenkins running locally/on-prem for learning.
- **App server (target EC2)** — the instance running CloudTask itself, with
  the IAM role already attached (from the main README).

If you want to keep it simple, Jenkins and the app can even run on the
**same EC2 instance** — Jenkins would just SSH to `localhost`. Instructions
below cover the more realistic two-instance setup, but note where it
simplifies if you use one instance.

---

## 1. Launch a Jenkins server (if you don't have one)

1. Launch a new EC2 instance (`t2.medium` recommended — Jenkins is a bit heavy for `t2.micro`), Ubuntu 22.04 or Amazon Linux 2023.
2. Security group: allow inbound **22** (SSH, your IP) and **8080** (Jenkins UI, your IP or `0.0.0.0/0` if you don't mind exposing it — better to restrict it).
3. SSH in and install Jenkins:

```bash
# --- Ubuntu ---
sudo apt update
sudo apt install -y openjdk-17-jdk git

curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | sudo tee \
  /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/ | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
sudo apt install -y jenkins
sudo systemctl enable --now jenkins
```

4. Also install Node.js on the **Jenkins server** (it runs `npm ci`, syntax checks, and packaging in the pipeline):

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

5. Get the initial admin password and unlock Jenkins:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Visit `http://<jenkins-server-ip>:8080`, paste the password, install
**Suggested Plugins**, then create your admin user.

---

## 2. Install required Jenkins plugins

Manage Jenkins → Plugins → Available plugins → install:

- **Pipeline** (usually pre-installed with "suggested plugins")
- **Git**
- **SSH Agent Plugin** (needed for the `sshagent` step in the Jenkinsfile)
- **Credentials Binding Plugin**
- (Optional) **Blue Ocean** — nicer pipeline visualization

Restart Jenkins if prompted.

---

## 3. Add credentials in Jenkins

Manage Jenkins → **Credentials** → (global) → **Add Credentials**, create these two:

| Credential | Kind | ID (must match Jenkinsfile) | Value |
|---|---|---|---|
| GitHub access | Username with password (or "Secret text" if using a PAT) | `github-creds` | Your GitHub username + Personal Access Token (needed only if your repo is private) |
| EC2 SSH key | SSH Username with private key | `ec2-ssh-key` | Username: your EC2 user (`ubuntu` or `ec2-user`); Private key: paste the contents of your `.pem` file |

If your GitHub repo is **public**, you can skip the `github-creds` credential and remove `credentialsId: 'github-creds'` from the `Checkout` stage.

---

## 4. Configure environment variables

The Jenkinsfile references `EC2_HOST`, `EC2_USER`, and `REPO_URL` as
environment variables. Set these as **Global properties** so every job can
use them:

Manage Jenkins → **System** → scroll to **Global properties** → check
**Environment variables** → add:

| Name | Value |
|---|---|
| `EC2_HOST` | Public IP or DNS of your **app** EC2 instance (not the Jenkins server) |
| `EC2_USER` | `ubuntu` or `ec2-user` |
| `REPO_URL` | `https://github.com/your-username/cloudtask-app.git` |

(Alternatively, define these directly inside the `environment {}` block of
the Jenkinsfile itself, or as parameters — global properties keep secrets
config out of source control.)

---

## 5. Prepare the target EC2 app server

Same as the manual setup in the main README — make sure the app server has:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
pm2 startup   # follow printed instructions
```

And create the `.env` file **once**, manually, in `/home/<user>/cloudtask-app/.env`
(the Jenkins pipeline deploys code but deliberately never overwrites `.env`,
so your DB password and bucket name stay off of Jenkins/Git entirely):

```bash
mkdir -p /home/<user>/cloudtask-app
nano /home/<user>/cloudtask-app/.env
# paste values from .env.example, filled in with your real RDS/S3 details
```

Make sure the app server's security group allows inbound **3306 from RDS's
security group is not needed** (that's the other direction) — instead, make
sure **RDS's** security group allows inbound 3306 **from the app EC2's
security group**, and that the app EC2 allows inbound **3000** from wherever
you'll browse from, plus **22** from the Jenkins server's IP/security group
(so Jenkins can SSH in to deploy).

---

## 6. Create the Jenkins pipeline job

1. Jenkins Dashboard → **New Item** → name it `cloudtask-app-deploy` → type: **Pipeline** → OK.
2. Under **Pipeline** section:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: your repo URL (same as `REPO_URL` above)
   - Credentials: `github-creds` (if private)
   - Branch: `*/main`
   - Script Path: `Jenkinsfile` (already included in this project's root)
3. Save.

This repo already includes a ready-to-use **`Jenkinsfile`** at the project
root with these stages:

```
Checkout → Install Dependencies → Syntax/Build Check → Test →
Package → Deploy to EC2 (scp + ssh + pm2 restart) → Health Check
```

---

## 7. Trigger the pipeline

**Manually (first run):** Open the job → **Build Now**. Watch the console
output — it will check out the repo, run `npm ci`, syntax-check the JS
files, tar up the app, `scp` it to the EC2 app server, run `npm run migrate`
+ `pm2 startOrRestart`, then hit `/health` to confirm the app came back up.

**Automatically on every push (recommended for real CI/CD):**
- Easiest for learning: Manage Jenkins → job → **Build Triggers** → check
  **Poll SCM** → schedule `H/5 * * * *` (polls GitHub every ~5 minutes).
- More "real": set up a **GitHub webhook** (repo → Settings → Webhooks →
  Add webhook → Payload URL: `http://<jenkins-ip>:8080/github-webhook/`,
  content type `application/json`) and enable **GitHub hook trigger for
  GITScm polling** in the job config. This pushes builds instantly instead
  of polling.

---

## 8. Verify the deploy

```bash
curl http://<app-ec2-public-ip>:3000/health
# {"status":"ok","timestamp":"..."}
```

Open `http://<app-ec2-public-ip>:3000` in a browser — you should see the
CloudTask UI, able to create tasks and upload attachments straight to S3.

---

## 9. How this differs from the GitHub Actions version

| | GitHub Actions (`.github/workflows/deploy.yml`) | Jenkins (`Jenkinsfile`) |
|---|---|---|
| Runs on | GitHub's hosted runners | Your own Jenkins server (full control, good for learning Jenkins specifically) |
| Trigger | Push to `main` (built-in) | Poll SCM or GitHub webhook (configured manually) |
| Secrets | GitHub repo Secrets | Jenkins Credentials store |
| Packaging | None — deploys code directly via git pull on server | Builds a `.tar.gz` artifact, archives it in Jenkins, then ships it via `scp` |
| Extra stages | Basic build/test | Adds an explicit health-check stage post-deploy |

You can run both in parallel while you're learning, or pick one — they
don't conflict since they both just end with `pm2 startOrRestart` on the
same app directory.

---

## 10. Next steps once this works

- Add real tests (`npm test`) and fail the pipeline if they don't pass.
- Add a **staging** environment/job before promoting to production.
- Store `.env` values in **AWS Secrets Manager** or **Jenkins Credentials**
  and inject them at deploy time instead of keeping a static file on the server.
- Explore **Jenkins agents on EC2** (dynamic build agents via the EC2 plugin) instead of a single static Jenkins server.
- Add a Slack/email notification stage on pipeline failure.
