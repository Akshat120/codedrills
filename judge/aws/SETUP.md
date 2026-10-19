# Setting up the judge on AWS Lambda

Everything here is done by hand in the AWS console (and a few commands on
your Mac), one lesson at a time. Each lesson ends with a check, so you know
it worked before moving on.

**What you'll have at the end**

```
Web app (local now, Cloudflare later)
  │  POST https://lambda.ap-south-1.amazonaws.com/2015-03-31/functions/codedrills-judge/invocations
  │  signed with the keys of IAM user "codedrills-invoker" (may only invoke this function)
  ▼
Lambda function "codedrills-judge"  (Node.js 24, arm64, 2048 MB, 2 min)
  ├─ code: judge-function.zip   (judge, runner, tests)
  ├─ layer "codedrills-gxx": compiler-layer.zip  (g++ at /opt/bin/g++)
  ├─ role: may only write its own logs + attach to the VPC
  └─ in the default VPC with security group "codedrills-judge-no-network"
     (no outbound rules → submissions can't reach the internet)
```

**What it costs: $0.** Everything stays inside AWS's always-free allowances:

| Service | Free every month | CodeDrills use |
|---|---|---|
| Lambda requests | 1,000,000 | one per judging, plus a status check at most once a minute |
| Lambda compute | 400,000 GB-seconds | a 5 s judging at 2 GB = 10 GB-s, so ~40,000 judgings |
| CloudWatch Logs | 5 GB | a few lines per judging, kept 7 days |
| VPC, security group, IAM | always free | |

Things that *would* cost money, and that this guide never creates: NAT
gateways, VPC endpoints, Elastic IPs, EC2 instances, ECR repositories,
provisioned concurrency. If a console screen offers one, skip it.

Use the **Asia Pacific (Mumbai) ap-south-1** region for everything (region
menu, top right of the console).

---

## Lesson 0: a spending alarm

So you hear about it the moment anything costs even $0.01.

1. Console search bar → **Billing and Cost Management** → **Budgets** →
   **Create budget**.
2. **Use a template** → **Zero spend budget**.
3. Name: `zero-spend`. Email: yours. **Create budget**.

Check: the budget is listed with amount $1.00 (that's how the template
shows "anything above $0.01").

---

## Lesson 1: build the two zips (on your Mac)

From the repo root, with Docker running:

```bash
judge/aws/build.sh
```

Check: it ends with two files in `judge/dist/`:
`compiler-layer.zip` (~25 MB) and `judge-function.zip` (~4 MB).

---

## Lesson 2: the compiler layer

A **layer** is a zip that Lambda unpacks at `/opt` next to the function's
code. Keeping the compiler in a layer means the judge code (which changes
often) is a small upload.

1. **Lambda** → left menu **Layers** → **Create layer**.
2. Name: `codedrills-gxx`.
   Description: `g++ 11 for the CodeDrills judge`.
3. **Upload a .zip file** → choose `judge/dist/compiler-layer.zip`.
4. Compatible architectures: **arm64**.
   Compatible runtimes: **Node.js 24.x**.
5. **Create**.

Check: the layer page shows **Version 1** and its **Version ARN**, ending in
`:layer:codedrills-gxx:1`.

---

## Lesson 3: the function

1. **Lambda** → **Functions** → **Create function** → **Author from scratch**.
2. Function name: `codedrills-judge`.
   Runtime: **Node.js 24.x**. Architecture: **arm64**.
3. **Change default execution role** → **Create a new role with basic Lambda
   permissions**. (Lambda creates a role named like
   `codedrills-judge-role-ab12cd34` that may only write this function's logs.)
4. Leave the advanced settings alone → **Create function**.

Now give it the judge's code:

5. **Code** tab → **Upload from** → **.zip file** → choose
   `judge/dist/judge-function.zip` → **Save**.
6. Still on the **Code** tab, scroll to **Runtime settings** → **Edit** →
   Handler: `src/index.handler` → **Save**.
7. Scroll to **Layers** (bottom of the Code tab) → **Add a layer** →
   **Custom layers** → `codedrills-gxx`, version `1` → **Add**.

And its size and time limits:

8. **Configuration** tab → **General configuration** → **Edit**:
   - Memory: `2048` MB
   - Ephemeral storage: `512` MB
   - Timeout: `2` min `0` sec

   **Save**.

Check: the function overview shows the layer (`Layers (1)`), and
Configuration → General shows 2048 MB / 512 MB / 2 min.

---

## Lesson 4: first judgings, from the console

1. **Test** tab → **Create new event** → Event name: `ping` → paste the
   contents of `judge/aws/events/ping.json` → **Save** → **Test**.

   Check: green **Succeeded**, response `{ "verdict": "PONG" }`.

2. **Create new event** again → Event name: `accepted` → paste the contents
   of `judge/aws/events/accepted.json` (CD0001's reference solution) →
   **Save** → **Test**.

   Check: response `"verdict": "AC"` with 11 tests. The log output below it
   has one line with the submission id, verdict and time (never the code).

---

## Lesson 5: every verdict, from your Mac

This sends 12 submissions (one per verdict type) with your own CLI user:

```bash
node judge/test/verdicts.mjs --aws codedrills-judge
```

Check: 11 lines say PASS, and **one says FAIL: `no internet access`**, with
`found: 'connected'`. That's expected for now: right now a submission can
open connections to the internet. The next lesson closes that.

---

## Lesson 6: no internet for submissions

A Lambda function normally has internet access. Putting it in a VPC subnet
with a security group that allows **no outbound traffic** takes it away.
(Calling the function still works: invocations don't come in over that
network.)

**6a. Let the role attach the function to the VPC**

1. **IAM** → **Roles** → `codedrills-judge-role-…`.
2. **Add permissions** → **Attach policies** → search
   `AWSLambdaVPCAccessExecutionRole` → tick it → **Add permissions**.

**6b. A security group that blocks everything**

1. **VPC** → left menu **Security groups** → **Create security group**.
2. Name: `codedrills-judge-no-network`.
   Description: `CodeDrills judge: no inbound or outbound traffic`.
   VPC: the **default** VPC.
3. Inbound rules: none.
   Outbound rules: **Delete** the "All traffic" rule that's there by default.
4. **Create security group**.

Check: the group's **Outbound rules** tab says there are no rules.

**6c. Put the function in the VPC**

1. **Lambda** → `codedrills-judge` → **Configuration** → **VPC** → **Edit**.
2. VPC: the default VPC.
   Subnets: pick two or three (any availability zones).
   Security groups: remove `default`, choose `codedrills-judge-no-network`.
   Leave "Allow IPv6 traffic" off.
3. **Save**. It takes a minute or two (the status shows "Updating").

Check: run the verdicts again:

```bash
node judge/test/verdicts.mjs --aws codedrills-judge
```

Now all 12 PASS, including `no internet access` (`found: 'blocked'`).

---

## Lesson 7: the user the web app calls the judge as

The web app gets its own IAM user whose **only** permission is invoking this
one function. If its keys ever leak, that's all they can do.

**7a. The user**

1. **IAM** → **Users** → **Create user** → name `codedrills-invoker`.
   Don't give it console access → **Next**.
2. **Attach policies directly** → don't tick anything → **Next** → **Create user**.

**7b. Its one permission**

1. Open `codedrills-invoker` → **Add permissions** → **Create inline policy**
   → **JSON** tab, paste this, replacing `ACCOUNT_ID` with your 12-digit
   account id (top-right menu of the console):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "lambda:InvokeFunction",
         "Resource": "arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:codedrills-judge"
       }
     ]
   }
   ```

2. **Next** → Policy name: `invoke-codedrills-judge` → **Create policy**.

**7c. Its access key**

1. `codedrills-invoker` → **Security credentials** → **Create access key** →
   **Application running outside AWS** → **Next** → **Create access key**.
2. Copy both values now (the secret is shown only once).

**7d. Point your local web app at the AWS judge**

Add to `web/.env` (never commit it):

```bash
JUDGE_URL=https://lambda.ap-south-1.amazonaws.com/2015-03-31/functions/codedrills-judge/invocations
JUDGE_AWS_ACCESS_KEY_ID=<access key id>
JUDGE_AWS_SECRET_ACCESS_KEY=<secret access key>
JUDGE_AWS_REGION=ap-south-1
```

Restart the web app (`npm run dev` in `web/`).

Check: the header's judge signal is green, and submitting CD0001's solution
on http://localhost:3000 gives **Accepted** from AWS (the function's
**Monitor** tab → **View CloudWatch logs** shows the judging).

On Cloudflare the same four values become Worker secrets (deployment
milestone).

---

## Lesson 8: keep logs for a week

1. **CloudWatch** → **Log groups** → `/aws/lambda/codedrills-judge`.
2. **Actions** → **Edit retention setting** → **1 week** → **Save**.

---

## Later: updating the judge

| What changed | Do |
|---|---|
| Judge code, runner or problem tests | `judge/aws/build.sh`, then Lambda → Code → Upload from → .zip file → `judge-function.zip` |
| The compiler | `judge/aws/build.sh`, then Layers → `codedrills-gxx` → Create version → `compiler-layer.zip`; then in the function's Layers → Edit → pick the new version |

Then run `node judge/test/verdicts.mjs --aws codedrills-judge` again.

## Checking costs

**Billing and Cost Management** → **Bills** (this month, per service) and
**Free Tier** (how much of each free allowance is used). Lambda should show
$0.00, and the zero-spend budget emails you if anything doesn't.
