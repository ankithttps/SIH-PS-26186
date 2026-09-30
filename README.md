# RakshakWell — Personnel Wellness Intelligence

Prototype for **SIH Problem Statement 26186**: AI-Based Predictive Personnel Stress and Welfare Monitoring System for Uniformed Forces.

## V2 prototype
- Welfare Officer / Commander / Personnel role context (demo)
- Personnel wellness dashboard
- Wellness trend visualization using illustrative check-in history
- Signal distribution overview
- Voluntary wellness self-assessment with live check-in preview
- Demo risk-signal calculation
- Personnel search + unit filtering
- Personnel detail modal with duty, leave, wellness and review context
- Predictive-style welfare risk engine using self-report + organizational context
- Explainable top risk factors for human review
- Early welfare alert workflow triggered by elevated/high demo signals
- Human-led intervention guidance
- Welfare intervention recommendations
- Privacy & governance screen
- Human-in-the-loop and welfare-first safeguards
- Responsive UI for desktop and mobile

## Run
```bash
npm install
npm run dev -- --host 0.0.0.0
```

## Prototype scope
This is a demonstration interface. Data is illustrative and stored only in frontend state. The risk calculation is a demo signal engine, not a clinical or psychological diagnosis. Production deployment would require secure backend services, authentication/authorization, consent controls, audit logging, validated analytics, and appropriate data governance.

## SIH demo positioning
The prototype is designed to demonstrate the workflow from voluntary self-reporting and organizational indicators to a reviewable welfare signal and human-led support action. It does not autonomously diagnose personnel or make disciplinary decisions.
