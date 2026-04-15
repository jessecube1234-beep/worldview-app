# AWS Demo Deploy (Elastic Beanstalk)

This path is optimized to get `worldview-app` live fast for a demo.

## 1. Prereqs

- AWS account + IAM user credentials configured locally
- AWS CLI installed
- EB CLI installed
- Node.js 18+ installed locally

## 2. Validate locally

```powershell
npm install
npm start
```

Open `http://localhost:4000` and confirm the app loads.

## 3. Initialize Elastic Beanstalk

From the repo root:

```powershell
eb init
```

Recommended selections:
- Region: closest to your audience
- Platform: `Node.js`
- Application name: `worldview-app`
- SSH setup: optional for demo

## 4. Create a demo environment

```powershell
eb create worldview-demo --single
```

`--single` uses a single EC2 instance (cheaper/faster for demo).

## 5. Set environment variables

```powershell
eb setenv WINDY_WEBCAMS_KEY=your_real_key_here
```

Optional:

```powershell
eb setenv GPS_JAM_URL=your_url_here
eb setenv GPS_JAM_URL_TEMPLATE=your_template_here
```

## 6. Deploy

```powershell
eb deploy
eb open
```

## 7. Verify

- App URL loads
- `https://<your-eb-url>/health` returns JSON with `ok: true`
- CCTV panel works (if `WINDY_WEBCAMS_KEY` is set)

## 8. Demo-day quick commands

```powershell
eb status
eb logs
eb deploy
```

## 9. Tear down after demo (avoid charges)

```powershell
eb terminate worldview-demo
```

