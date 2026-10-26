<!-- Panduan internal QA. Sengaja tidak dipublikasikan di docs.hris.click -->

# Registration Testing

When someone registers, HRIS emails them a **6-digit verification code**. For testing, an administrator can issue a fresh code through the API instead of reading the inbox:

```
GET /api/v1/auth/verification-code?email=<email>
```

## Prerequisites

- An **administrator** account. Other roles receive `403`, regardless of their features.
- QA tools enabled on the target server (`QA_TOOLS_ENABLED=true`). When disabled, the endpoint responds `404` as if it did not exist.
- A unique email and phone number for every test run.

## Steps

```
1. Register  →  2. Sign in as admin  →  3. Issue a code  →  4. Verify the email  →  5. Approve  →  6. Sign in
```

### 1. Register the test account

`POST /auth/register`, without a token:

```json
{
  "email": "qa.test01@gmail.com",
  "password": "Password123!",
  "full_name": "QA Test Account",
  "phone": "+6281299990001",
  "gender": "male",
  "terms_accepted": true
}
```

Expected: `201 Created`.

### 2. Sign in as an administrator

`POST /auth/login` with an administrator account and copy `data.token`. In Swagger, paste it into **Authorize**.

### 3. Issue a verification code

`GET /auth/verification-code?email=qa.test01@gmail.com` with the administrator token:

```json
{
  "success": true,
  "message": "A new verification code was issued. Earlier codes no longer work.",
  "data": {
    "email": "qa.test01@gmail.com",
    "code": "482913",
    "expires_in_minutes": 10
  }
}
```

> **Note:** every call issues a **new** code and invalidates earlier ones, including the one sent by email. Always use the code from the most recent call.

### 4. Verify the email

`POST /auth/verify-email`, without a token:

```json
{ "email": "qa.test01@gmail.com", "code": "482913" }
```

Expected: `200 OK` with `"email_verified": true`. Each code allows at most 5 attempts.

### 5. Approve the account

1. `GET /users/pending` with the administrator token, and copy the account `id`.
2. `PATCH /users/{id}/approve`.

### 6. Sign in as the new account

`POST /auth/login` with the email and password from step 1. Expected: `200 OK` with a token.

## Troubleshooting step 3

| Status | Message                                  | Cause                                         |
| ------ | ---------------------------------------- | --------------------------------------------- |
| 401    | Token not found / invalid                | Sign in as the administrator again            |
| 403    | You don't have access to this feature    | The token does not belong to an administrator |
| 404    | No account is registered with this email | The email has not been registered             |
| 404    | Route GET … not found                    | QA tools are disabled on the server           |
| 409    | This email is already verified           | Continue with step 5                          |

> **Caution:** this endpoint exists only for testing and is disabled after the QA period (`QA_TOOLS_ENABLED`). Never share screenshots that show a full administrator token.
