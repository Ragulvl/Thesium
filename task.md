# Thesium Fix Tasks

## PR-1: Security Fixes
- [x] Fix .gitignore (add .env.* pattern)
- [/] Strip real credentials from .env.development
- [ ] Strip real credentials from .env.production  
- [ ] Create .env.example template
- [ ] Fix Razorpay null-secret crash in payment.routes.ts
- [ ] Add Razorpay keys to env Zod schema
- [ ] Fix coupon TOCTOU race condition (atomic transaction)
- [ ] Fix SVG sanitization in imageGenerator.ts
- [ ] Fix auth.ts CLIENT_ID fallback

## PR-2: Production Readiness  
- [ ] Fix health check endpoint (real DB+Redis test)
- [ ] Add logger.fatal method
- [ ] Fix admin.controller.ts req.log crash
- [ ] Fix unhandled worker import promise
- [ ] Fix graceful shutdown (close queue)
- [ ] Worker: use shared Redis client
- [ ] Worker: add failed-job alerting
- [ ] Fix docker-compose (remove DB/Redis ports)
- [ ] Fix docker-compose (add Redis persistence)
- [ ] Fix docker-compose (add OPENROUTER_API_KEYS)

## PR-3: Backend Correctness
- [ ] Add quota enforcement in queueSectionGeneration
- [ ] Register queueAllSections route
- [ ] Fix logger.fatal in validateEnv.ts
- [ ] Fix tokens always 0 in pipeline usage
- [ ] Add vitest coverage thresholds

## PR-4: Database Fixes
- [ ] Add ThesisStatus enum to schema
- [ ] Fix date field type
- [ ] Add CouponRedemption unique index

## PR-5: Frontend Fixes
- [ ] Add React Error Boundary
- [ ] Fix workspace polling (use job status)

## PR-6: Testing
- [ ] Add payment route tests
- [ ] Add coupon race condition test  
- [ ] Add quota enforcement test
- [ ] Add health endpoint test
