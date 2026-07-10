#!/bin/bash
set -e

# Generate a private key and CSR for workflow.digital.gov.bc.ca
# including Subject Alternative Names (SANs).

openssl req -new -sha256 -nodes \
  -out workflow.digital.gov.bc.ca.csr \
  -newkey rsa:2048 \
  -keyout workflow.digital.gov.bc.ca.key \
  -config <(cat <<'EOF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = CA
ST = British Columbia
L = Victoria
O = Government of the Province of British Columbia
OU = Citizens' Services
CN = workflow.digital.gov.bc.ca

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = workflow.digital.gov.bc.ca
DNS.2 = dashboard.workflow.digital.gov.bc.ca
DNS.3 = mirror.workflow.digital.gov.bc.ca
EOF
)

# Restrict private key permissions
chmod 600 workflow.digital.gov.bc.ca.key

# Display CSR details for verification
openssl req -in workflow.digital.gov.bc.ca.csr -noout -text
