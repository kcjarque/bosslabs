#!/usr/bin/env bash
# Fix the broken SES tracking cert on track.conexmedia.ph end-to-end via AWS CLI.
#
# Pre-reqs:
#   1. AWS CLI installed (`aws --version`)
#   2. ADMIN AWS credentials in your shell — NOT the conexmail-app user.
#      Run `aws sts get-caller-identity` first; the Arn should be your own
#      IAM user or role, not `arn:aws:iam::454492134371:user/conexmail-app`.
#      Easiest: `export AWS_PROFILE=<your-admin-profile>` or paste admin
#      AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY into the shell.
#   3. Access to whatever DNS provider hosts conexmedia.ph
#      (Cloudflare / Route53 / GoDaddy / etc.) — you'll add one CNAME mid-script.
#
# Required IAM perms on the admin user/role:
#   acm:RequestCertificate, acm:DescribeCertificate, acm:ListCertificates
#   sesv2:GetConfigurationSet, sesv2:PutConfigurationSetTrackingOptions
#   sesv2:ListConfigurationSets
#
# Usage:
#   bash scripts/fix-ses-tracking-cert.sh

set -euo pipefail

REGION="ap-southeast-2"
DOMAIN="track.conexmedia.ph"

echo "─── 0. Verifying you're using admin creds (not conexmail-app) ───"
CALLER=$(aws sts get-caller-identity --query Arn --output text)
echo "Caller: $CALLER"
if [[ "$CALLER" == *"conexmail-app"* ]]; then
  echo
  echo "❌ Stop — you're using the send-only conexmail-app user. Switch to an admin profile:"
  echo "     export AWS_PROFILE=<your-admin-profile>"
  echo "   then re-run this script."
  exit 1
fi
echo "✓ Looks like admin creds, proceeding."
echo

echo "─── 1. Listing SES configuration sets to find yours ───"
aws sesv2 list-configuration-sets --region "$REGION" --query "ConfigurationSets[]" --output table
echo
read -rp "Type the config set name to fix: " CONFIG_SET
if [[ -z "$CONFIG_SET" ]]; then echo "No config set name given. Exiting."; exit 1; fi
echo

echo "─── 2. Requesting public ACM cert for $DOMAIN in $REGION ───"
CERT_ARN=$(aws acm request-certificate \
  --region "$REGION" \
  --domain-name "$DOMAIN" \
  --validation-method DNS \
  --query CertificateArn --output text)
echo "✓ Cert ARN: $CERT_ARN"
echo

echo "─── 3. Fetching the DNS validation CNAME ───"
sleep 3 # ACM populates the validation record asynchronously
VALIDATION_JSON=$(aws acm describe-certificate \
  --region "$REGION" \
  --certificate-arn "$CERT_ARN" \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
  --output json)
VALIDATION_NAME=$(echo "$VALIDATION_JSON" | jq -r .Name)
VALIDATION_VALUE=$(echo "$VALIDATION_JSON" | jq -r .Value)
echo
echo "👉 Add this CNAME at your DNS provider for conexmedia.ph:"
echo
echo "   Type:  CNAME"
echo "   Name:  $VALIDATION_NAME"
echo "   Value: $VALIDATION_VALUE"
echo "   TTL:   any (300 is fine)"
echo
read -rp "Press Enter once the CNAME is added at your DNS provider… "

echo "─── 4. Waiting for ACM to validate (typically 1–10 min after DNS propagates) ───"
aws acm wait certificate-validated --region "$REGION" --certificate-arn "$CERT_ARN"
echo "✓ Cert validated + issued."
echo

echo "─── 5. Attaching the cert as the SES tracking domain ───"
# SESv2 auto-uses ACM certs in the same region that match the custom redirect
# domain, so just pointing the config set at the domain is enough.
aws sesv2 put-configuration-set-tracking-options \
  --region "$REGION" \
  --configuration-set-name "$CONFIG_SET" \
  --custom-redirect-domain "$DOMAIN"
echo "✓ Config set '$CONFIG_SET' now uses $DOMAIN for tracking."
echo

echo "─── 6. Live cert check ───"
sleep 10 # give SES a beat to flip over
SUBJECT=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null || echo "")
echo "Cert presented: $SUBJECT"
if [[ "$SUBJECT" == *"$DOMAIN"* ]]; then
  echo "🎉 Fixed. Email tracking links will now open without cert warnings."
else
  echo "⚠️  Cert hasn't propagated yet — try again in 5 min. Worst-case wait 30 min."
fi
