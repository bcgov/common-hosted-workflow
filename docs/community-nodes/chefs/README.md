# Common Hosted Form Service (CHEFS)

The CHEFS node retrieves a submission, a form's available status codes, or a submission's status history from the Common Hosted Form Service. It is a version 1 declarative n8n node (`chefs`) using the **CHEFS API** credential (`chefsApi`).

## Quick start

1. Obtain the CHEFS Form ID and its API key from your form's API configuration.
2. Create a **CHEFS API** credential with that API key and a nonblank local **Authorization Token**.
3. Add **Common Hosted Form Service (CHEFS)** to the workflow and select the credential.
4. Choose a resource and operation. Enter the **Form ID** and a node **Authorization Token** exactly matching the credential token.
5. Supply **Submission ID** for either submission operation. **Get Form Statuses** needs no Submission ID.

Requests use the fixed base URL `https://submit.digital.gov.bc.ca/app/api/v1`. Form ID is required even for submission routes because it is the upstream Basic authentication username.

## Guides

- [Node operations and input matrix](./node-operations.md)
- [Credentials and the two authentication layers](./credentials.md)
- [Release notes and migration](./release-notes.md)
- [Upstream CHEFS API reference](https://submit.digital.gov.bc.ca/app/api/v1/docs)

The node uses n8n's standard declarative JSON response handling; it has no custom response transformation. It supports these three read operations only.
