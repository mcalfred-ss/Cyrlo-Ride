# Investor Demo Mode (two phones)

Pitch Cyrlo Ride end-to-end on **two devices** without real Paystack charges. Mock Pragya riders fill the map; a real rider phone accepts the job.

## Prerequisites

- Staging API with `DEMO_MODE=true` (or `1`) in `/etc/cyrlo-ride/ride.env`
- Two phones running the same app build pointed at staging
- Approved rider account with tokens ≥ 1 (review rider `+233555010002` / OTP `246810` works if seeded)
- Passenger account (review passenger `+233555010001` or a real number)

## Pitch steps

1. **Both phones → Account → Demo mode → ON**  
   Copy: “Investor pitch — mock riders, no real payment.”
2. **Rider phone**  
   - Sign in as Rider  
   - Go online (Demo Mode pins GPS to the Kokobin/Kumasi pilot area if the venue GPS is outside the zone)
3. **Passenger phone**  
   - Sign in as Passenger  
   - Home/Map: mock riders appear (names like `Ama (Demo)`) plus any live rider  
   - **Book a Pragya** → create SEARCHING booking
4. **Rider phone**  
   - Accept the offer on Jobs/Map  
   - Connection fee is **auto-SUCCESS** (no Paystack)  
   - Start trip → End trip
5. **Passenger phone**  
   - Rate the rider when prompted
6. **After the meeting**  
   - Turn **Demo mode OFF** on both phones  
   - Keep `DEMO_MODE=false` on production

## What Demo Mode changes

| Layer | Behaviour |
| --- | --- |
| Flutter | `X-Cyrlo-Demo: 1` on API calls; mock nearby pins; Book CTA always available; pinned GPS for go-online |
| Backend | Only when `DEMO_MODE` env is on **and** header present: mark GH₵1 fee SUCCESS, skip Paystack |

## Ops: enable on staging

```bash
# on VPS
grep DEMO_MODE /etc/cyrlo-ride/ride.env || echo 'DEMO_MODE=true' >> /etc/cyrlo-ride/ride.env
# or edit existing line to DEMO_MODE=true
systemctl restart cyrlo-ride-api
```

Without `DEMO_MODE=true`, the client header is ignored (safe for production).
