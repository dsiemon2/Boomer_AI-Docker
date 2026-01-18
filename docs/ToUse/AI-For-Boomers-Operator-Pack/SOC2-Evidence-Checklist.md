# SOC 2 Evidence Checklist (Expanded)

Use this checklist to attach **evidence artifacts** to SOC 2 Jira tickets. Each control lists **what to implement** and **what evidence to capture**.

## Evidence Rules of Thumb
- Evidence should be **dated**, **repeatable**, and **exportable** (PDF/CSV/screenshots)
- Prefer **system-generated** evidence over manual statements
- Store evidence in a controlled folder with access logs

---

## Security Domain

### Control: RBAC (Role-Based Access Control)
**Implementation**
- Define roles: User, Caregiver, Support Agent, Admin
- Enforce authorization server-side for all endpoints
- Review and document privilege boundaries (least privilege)

**Evidence**
- Screenshot/export of role matrix
- API gateway / backend policy configuration
- Audit log entries showing access decisions
- Quarterly access review report (CSV/PDF)

### Control: MFA for Privileged Roles
**Implementation**
- Require MFA for Support/Admin accounts
- Support device binding / remembered devices (optional)

**Evidence**
- IdP policy screenshot (Auth0/Azure AD B2C/Cognito)
- Export of users with MFA enabled
- Test results showing MFA enforcement

### Control: Audit Logging
**Implementation**
- Central audit log for critical actions:
  - medication changes, caregiver access, exports, login events
- Retention policy (e.g., 365 days)

**Evidence**
- Log schema and sample entries (redacted)
- Retention settings screenshot
- Query showing last 30 days of critical events

### Control: Vulnerability Management
**Implementation**
- Dependency scanning (SCA) in CI/CD
- Monthly patch cadence for OS/base images
- Triage SLA (e.g., Critical 72h)

**Evidence**
- CI scan reports (Snyk/Dependabot/etc.)
- Ticket history showing remediation timelines
- Patch log / release notes

---

## Availability Domain

### Control: Monitoring & Alerting
**Implementation**
- Uptime checks, queue depth, notification failure rate
- Alert thresholds with on-call routing

**Evidence**
- Monitoring dashboards screenshots
- Alert rules exports
- Incident logs showing alerts triggered and resolved

### Control: Incident Response Plan (IRP)
**Implementation**
- Document IR plan (roles, severity, comms, postmortems)
- Run tabletop exercise quarterly

**Evidence**
- IR plan document version history
- Tabletop exercise notes and action items
- Postmortem template + completed postmortem (if any)

### Control: Disaster Recovery (Backups + Restore Tests)
**Implementation**
- Automated backups of non-medical data by policy
- Restore testing (quarterly)

**Evidence**
- Backup job configuration exports
- Restore test results and timestamps
- RTO/RPO targets documented

---

## Confidentiality Domain

### Control: Encryption In Transit
**Implementation**
- TLS 1.2+ everywhere
- HSTS and secure cookies

**Evidence**
- TLS configuration screenshot
- Security headers scan output
- Load balancer / gateway config export

### Control: Encryption At Rest
**Implementation**
- DB encryption at rest
- Encrypted secrets in KMS/Key Vault

**Evidence**
- Cloud provider encryption settings screenshot
- KMS/Key Vault policy exports
- Secret rotation logs

---

## Privacy / Consent (Strongly Recommended)
### Control: Consent Management
**Implementation**
- Consent flags for SMS/email/location/health-data backup opt-in
- Consent audit history visible to user

**Evidence**
- Consent schema
- Screenshots of consent UI
- Export of consent change logs (redacted)
