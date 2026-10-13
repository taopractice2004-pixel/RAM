# RMG review checklist for Phase 2

## Purpose
This is the reviewer guide for the current Phase 2 implementation. It is meant for a quick RMG review of what changed, what to validate in the UI, and what questions to ask before approving the work.

## What changed

### 1. Demand management
The app now captures staffing demand as a formal record instead of informal project notes.

Review areas:
- Demand page
- Create demand form
- CSV import flow
- Demand lifecycle states
- Permission gating by role

Key fields:
- portfolio
- project name/code
- client
- role name
- location
- required skills and experience
- certifications
- required FTE
- start and end date
- status
- confidence stage
- notes

### 2. Demand lifecycle logic
Demand now follows a simple lifecycle model:
- Draft
- Pipeline
- Committed
- Fulfilled
- Cancelled

Rules to confirm:
- invalid transitions are blocked
- cancellation is allowed only before fulfillment
- demand is not treated as fulfilled without a valid status progression

### 3. Forecasting
The app now includes a 26-week explainable forecast view for staff demand and supply balancing.

Review areas:
- Reports page
- Forecast section
- Weekly forecast buckets
- Demand vs supply comparison

Important note:
- forecast totals are intentionally not weighted yet because the business has not approved the confidence-stage weights
- the current version is transparent and explainable by design

### 4. Bench and termination reporting
The reporting layer was tightened to better support review and operational decisions.

Review areas:
- bench-aging report
- termination-trend report
- portfolio/date/status filters
- summary values and total counts

### 5. Role and portfolio restrictions
The project keeps the approved governance rules:
- Admin and RMG can create and edit demand
- Delivery is read-only for demand where applicable
- TA can access non-sensitive bench/forecast information in authorized portfolios
- TA cannot view PIP or cost-sensitive fields
- unauthorized users do not get hidden sensitive signals

## Demo login behavior
All demo users use the same password:
- Password123!

The login page now pre-fills the password automatically when a demo user is selected, so reviewers do not have to manually type it repeatedly.

## UI screens to review
1. Login page
   - verify the seeded accounts work
   - verify auto-fill password works
2. Dashboard
   - confirm portfolio/resource overview renders properly
3. Demand page
   - create a demand record
   - validate lifecycle state updates
   - review CSV import flow
4. Reports page
   - review forecast display and filters
   - review bench/termination summaries
5. Access tests by role
   - Admin
   - RMG
   - Delivery
   - TA
   - Viewer

## Questions for the RMG reviewer
1. Does the demand model match how you track staffing requests today?
2. Is the Draft → Pipeline → Committed → Fulfilled flow acceptable?
3. Should we add more demand statuses or approval gates later?
4. Are the forecast buckets useful for planning discussions?
5. Is the non-weighted forecast acceptable for now until confidence weighting is approved?
6. Are the role restrictions aligned with your business governance expectations?

## What to tell the team in Teams / email
Use the following message structure:

- I reviewed the Phase 2 implementation in the RAM app.
- The new part is the staffing-demand management layer and forecast view.
- We can now capture demand, validate lifecycle transitions, import demand from CSV, and compare demand to supply over a 26-week horizon.
- The system keeps sensitive PIP and cost data protected behind the approved access rules.
- I would like the RMG team to validate the demand model, forecast usefulness, and access restrictions before sign-off.

## Final note
If the business approves the confidence-stage weighting later, the forecast totals can be made weighted. Until then, the current version keeps the forecast explainable and aligned with the documented decision register.
