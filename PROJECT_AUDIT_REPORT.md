# drivingLynX Project Audit Report

- Audit Date: February 15, 2026 EST
- Project Root: `/Users/afaiyaz/Library/Mobile Documents/com~apple~CloudDocs/Documents/2026/Spring/drivingLynX/Codex-Feb-2026/drivingLynX-main`

## Executive Summary

drivingLynX is a two-sided driving lesson marketplace with:
- learner and mentor onboarding
- mentor approval workflow
- Stripe Connect onboarding and payout readiness checks
- booking and payment authorization/capture flow
- QR-based session start/end validation
- post-session evaluation and mutual rating

The codebase is split into a static frontend (`html/css/js`) and a FastAPI backend (`drivingLynX_backend`) backed by PostgreSQL.

## Project Structure (Critical View)

### Frontend
- `index.html`: Main app shell and dashboard views.
- `admin.html`: Admin mentor approval interface.
- `audit.html`: Admin audit log viewer.
- `mentor-share.html`: Public mentor profile/share page.
- `terms.html`: Terms and safety page.
- `css/style.css`: UI styling.
- `js/app.js`: Core application state + user workflows.
- `js/ui.js`: Renderers and UI state transitions.
- `js/api.js`: Backend API client wrapper.

### Backend
- `drivingLynX_backend/main.py`: FastAPI app, route definitions, Stripe, booking/session logic.
- `drivingLynX_backend/models/user_models.py`: SQLAlchemy models (`users`, `sessions`).
- `drivingLynX_backend/models/base.py`: SQLAlchemy base.
- `drivingLynX_backend/database/session.py`: DB engine/session setup.
- `drivingLynX_backend/main_db.sh`: PostgreSQL schema/bootstrap script.
- `drivingLynX_backend/requirements.txt`: Backend dependencies.

## Feature Inventory

### 1) Authentication and Identity
- Registration with role-aware setup (`mentor` starts as `pending_review`).
- Email OTP send/verify flow before login is allowed.
- Login returns profile flags used by frontend gating (email verified, mentor status, payout state).

### 2) Mentor Discovery and Public Profiles
- Search/list approved mentors with optional zip/rate/car filters.
- Mentor profile includes availability, media, vehicle info, and rating attributes.
- Public share page exposes mentor profile and license media.

### 3) Mentor Operations
- Weekly availability editor and persistence.
- Stripe onboarding trigger and status refresh.
- Dual rate configuration:
  - lesson with mentor car
  - lesson without mentor car
- “Helping Mode” (volunteer/zero-rate behavior in UI flow).

### 4) Booking and Payments
- Slot-based booking creation.
- Stripe PaymentIntent authorization flow.
- Platform fee calculation with configured min/max bounds.
- Mentor accept/reject action on incoming requests.
- Cancellation logic with 48-hour rule and fee handling.

### 5) Live Session Execution
- QR token generation:
  - mentor creates START token
  - learner creates END token
- QR scanning transitions session state:
  - `pending/accepted` -> `active`
  - `active` -> `completed/paid`
- End-of-session amount calculation and payment capture attempt.

### 6) Post-Session Quality Loop
- Mentor checklist evaluation submission.
- Bidirectional rating/comment submission (learner->mentor, mentor->learner).

### 7) Admin and Compliance
- Admin-token protected mentor approval endpoints.
- Stripe account reset endpoint for admin remediation.
- Audit log capture for onboarding/payment/admin events.

## Data Model Summary

### `users`
Major fields:
- identity/role: `id`, `role`, `first_name`, `last_name`, `email`, `password`
- logistics: `license_number`, `has_car`, `car_make_model`, `car_plate`
- location/rates: `city`, `state`, `zip_code`, `hourly_rate_*`
- verification: `mentor_status`, `email_verified`, OTP hash/expiry fields
- Stripe: `stripe_account_id`, onboarding flag, product ids
- media: `profile_photo`, `license_image`
- scheduling/ratings: `weekly_availability`, rating metrics

### `sessions`
Major fields:
- linkage: `mentor_id`, `mentee_id`
- schedule/status: `scheduled_datetime`, `duration_hours`, `status`
- execution: `start_time`, `end_time`
- financials: `hourly_rate_snapshot`, `total_cost`, `booking_fee`, `payment_intent_id`
- quality: `evaluation_data`, mutual ratings/comments

## Technical Risks (Critical)

1. Password handling risk:
- Current login compares plaintext password values.
- No hashing/salting layer is present in current auth flow.

2. Weak request authorization pattern:
- Multiple sensitive actions rely on user IDs in query/body rather than token-based auth.
- Risk of unauthorized access if client-side values are manipulated.

3. QR end-flow capture bug risk:
- In session end capture path, `mentor` is referenced during Stripe capture but may be undefined in that code branch.

4. Broad CORS:
- `allow_origins=["*"]` with permissive methods/headers increases exposure.

## Backend API Function Report (End Section)

Total endpoints in `drivingLynX_backend/main.py`: 40

### Health, Auth, User, Mentor
1. `GET /api/health`
2. `GET /api/version`
3. `POST /api/register`
4. `POST /api/login`
5. `PATCH /api/users/{user_id}`
6. `GET /api/users/{user_id}`
7. `GET /api/mentors`
8. `GET /api/mentors/{mentor_id}`
9. `POST /api/availability/update`

### Stripe Connect, Products, Checkout, Policy, Public Mentor
10. `POST /api/stripe/connect/create_account`
11. `POST /api/stripe/onboard`
12. `GET /api/stripe/status/{user_id}`
13. `GET /api/stripe/account_status/{account_id}`
14. `POST /api/stripe/lesson_rates`
15. `GET /api/stripe/lesson_products/{account_id}`
16. `GET /api/policy/refunds`
17. `GET /api/public/mentors/{mentor_id}`
18. `POST /api/stripe/products`
19. `GET /api/stripe/products/{account_id}`
20. `POST /api/stripe/checkout`
21. `POST /api/stripe/webhook/v2`
22. `POST /api/stripe/webhook/v1`

### Admin
23. `GET /api/admin/mentors`
24. `POST /api/admin/mentors/approve`
25. `POST /api/admin/mentors/reset_stripe`
26. `GET /api/admin/audit_logs`

### Email OTP
27. `POST /api/email/verify-otp`
28. `POST /api/email/send-otp`

### Bookings, Requests, Sessions, QR, Evaluation, Ratings
29. `POST /api/bookings`
30. `POST /api/bookings/create_intent`
31. `POST /api/bookings/cancel`
32. `POST /api/payment/confirm`
33. `GET /api/requests/{mentor_id}`
34. `POST /api/bookings/action`
35. `GET /api/sessions/upcoming`
36. `GET /api/sessions/{session_id}`
37. `GET /api/sessions/{session_id}/qr_token`
38. `POST /api/sessions/scan`
39. `POST /api/sessions/{session_id}/evaluate`
40. `POST /api/sessions/{session_id}/rate`

## Notes

- Backend app root path is configured as `/x003` in FastAPI.
- Frontend API base currently points to hosted endpoint: `https://jerin-api.flyai.online/x003/api`.
