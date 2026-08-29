# Security Review Report

## Overview
This document outlines security findings from a review of the design dashboard codebase. Most issues are medium severity or lower, as the application primarily fetches and displays public data. However, several improvements are recommended for production deployment.

---

## 🔴 High Severity Issues

### 1. Missing Security Headers
**Location:** [server/index.ts](server/index.ts)  
**Risk:** XSS, Clickjacking, MIME type sniffing attacks

The server doesn't set critical security headers. In production, this exposes the application to:
- **Cross-Site Scripting (XSS):** No Content Security Policy (CSP)
- **Clickjacking:** No X-Frame-Options header
- **MIME sniffing:** No X-Content-Type-Options header

**Recommendation:**
Install and use the `helmet` middleware:
```bash
npm install helmet
```

Then add to your server:
```typescript
import helmet from 'helmet'
app.use(helmet())
```

---

## 🟠 Medium Severity Issues

### 2. XML External Entity (XXE) Vulnerability
**Location:** [server/routes/news.ts](server/routes/news.ts#L24), [server/routes/trends.ts](server/routes/trends.ts#L11)  
**Risk:** XXE attacks, denial of service  

The XMLParser in fast-xml-parser is not explicitly configured to prevent XXE attacks:
```typescript
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,  // ⚠️ Missing XXE protection
})
```

**Recommendation:**
Explicitly disable external entities in all XMLParser instances:
```typescript
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: () => false,
  processEntities: false,  // Disable entity processing
  resolveNameSpace: false,
})
```

Verify this setting in:
- news.ts (line 24)
- trends.ts (line 11)

---

### 3. Error Message Information Disclosure
**Location:** [server/index.ts](server/index.ts#L54)  
**Risk:** Information disclosure via error details

The global error handler exposes full error messages to clients:
```typescript
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server error]', err)
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
})
```

In production, this can leak internal server paths, API details, or database schema information.

**Recommendation:**
Sanitize error messages in production:
```typescript
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server error]', err)
  const isDev = process.env.NODE_ENV === 'development'
  const message = isDev && err instanceof Error ? err.message : 'Internal server error'
  res.status(500).json({ error: message })
})
```

---

### 4. No Rate Limiting
**Location:** [server/index.ts](server/index.ts)  
**Risk:** Denial of Service (DoS), resource exhaustion

API endpoints lack rate limiting, allowing potential DoS attacks or excessive upstream API calls.

**Recommendation:**
Add rate limiting middleware:
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit'

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/', apiLimiter)
```

---

### 5. Sensitive Default in User-Agent
**Location:** [server/routes/stocks.ts](server/routes/stocks.ts#L26)  
**Risk:** Information disclosure  

The SEC User-Agent defaults to a potentially-revealing value:
```typescript
const SEC_UA = `design-dashboard (${process.env.SEC_CONTACT ?? 'admin@dashboard.local'})`
```

The hardcoded default `admin@dashboard.local` is a placeholder that could leak information about the application structure.

**Recommendation:**
Use a generic default or require explicit configuration:
```typescript
const SEC_UA = process.env.SEC_CONTACT 
  ? `design-dashboard (${process.env.SEC_CONTACT})`
  : 'design-dashboard'
```

Document the optional SEC_CONTACT in your .env.local.example.

---

## 🟡 Low Severity Issues

### 6. No HTTPS Enforcement
**Location:** [server/index.ts](server/index.ts)  
**Risk:** Man-in-the-middle attacks, credential interception

The server doesn't enforce HTTPS in production environments.

**Recommendation:**
Add trust proxy and HTTPS redirect for production deployments:
```typescript
// For deployments behind a proxy (e.g., Render)
app.set('trust proxy', 1)

// Redirect HTTP to HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.get('host')}${req.originalUrl}`)
    }
    next()
  })
}
```

---

### 7. No Explicit CORS Configuration
**Location:** [server/index.ts](server/index.ts)  
**Risk:** Unintended cross-origin requests  

While the app uses same-origin for `/api/*` calls, explicit CORS configuration is missing. This could lead to unexpected behavior if:
- The frontend and backend are deployed on different domains
- Mobile apps or third-party integrations access these APIs

**Recommendation:**
Add explicit CORS configuration when needed:
```bash
npm install cors
```

```typescript
import cors from 'cors'

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'OPTIONS'],
  maxAge: 3600,
}

app.use('/api/', cors(corsOptions))
```

---

### 8. No Input Validation in Some Routes
**Location:** [server/routes/fx.ts](server/routes/fx.ts#L27), [server/routes/rates.ts](server/routes/rates.ts)  
**Risk:** URL injection, unexpected API calls  

While most routes (stocks, trends) validate input with regex patterns, not all do:
- **fx.ts:** Validates base currency with `CURRENCY_RE` ✓
- **rates.ts:** No input validation
- **weather.ts:** Validates lat/lon with Number checks ✓
- **news.ts:** Validates topic name ✓
- **trends.ts:** Validates geo code ✓

The rates endpoint constructs URLs without validation on CSV parsing.

**Recommendation:**
This is low risk since the endpoint doesn't accept user input for URL construction, but consider adding validation for defensive programming.

---

### 9. Missing CSP Headers for API Responses
**Location:** All API routes  
**Risk:** Low - API returns JSON, not HTML  

While JSON responses are safe, consider adding headers to reinforce this:
```typescript
app.use('/api/', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})
```

---

## 🟢 Security Strengths

✅ **Input Validation:** Most routes validate user input with regex (stocks, trends, fx)  
✅ **Timeout Protection:** Upstream fetch requests have timeouts to prevent hangs  
✅ **Environment Secrets:** .env.local is properly gitignored  
✅ **Cache Strategy:** Caching limits prevent memory exhaustion (MAX_CACHE_ENTRIES = 500)  
✅ **Retry Limits:** Retries are bounded (one retry max)  
✅ **JSON Parsing:** No eval() or unsafe deserialization  
✅ **React XSS Protection:** React component rendering prevents most XSS issues  
✅ **No Database Access:** Reduced attack surface (data-only fetching)  

---

## Implementation Priority

### Priority 1 (Do First)
1. Install helmet for security headers
2. Fix XXE vulnerability in XMLParser
3. Add rate limiting

### Priority 2 (Before Production)
4. Sanitize error messages in production
5. Fix SEC_UA default value
6. Add HTTPS enforcement for production

### Priority 3 (Nice to Have)
7. Explicit CORS configuration
8. Explicit CSP headers for API responses

---

## Testing Recommendations

After implementing fixes:
1. **Security Headers:** Test with https://securityheaders.com
2. **Rate Limiting:** Simulate rapid requests to verify limits work
3. **Error Handling:** Test with invalid inputs and verify no sensitive data leaks
4. **XXE Protection:** Verify XMLParser rejects external entities
5. **HTTPS:** Verify redirect works in production

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Express Security Middleware](https://expressjs.com/en/advanced/best-practice-security.html)
