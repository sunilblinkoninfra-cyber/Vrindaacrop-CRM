# Starter Outreach Templates — One Per Sector

Ready to paste into **Templates → New template** on the live CRM (`Template name` /
`Subject A` / `Subject B` / `HTML body`). These are also seeded automatically by
[scripts/seed-sector-templates.ts](../scripts/seed-sector-templates.ts) — run that script
against a database instead of pasting these by hand if you have `DATABASE_URL` access.

`{{firstName}}` and `{{company}}` are auto-filled per lead at send time; `{{unsubscribe}}`
is auto-appended if not present in the body.

---

## 1. B&I

**Name:** `B&I — Intro Outreach`
**Subject A:** `Facility management support for {{company}}`
**Subject B:** `A quicker way to run {{company}}'s day-to-day FM`

```html
<p>Hi {{firstName}},</p>
<p>I work with business &amp; institutional campuses like {{company}} on integrated facility management — housekeeping, front-office support, security, and technical maintenance under one accountable team instead of juggling multiple vendors.</p>
<p>Clients in your sector typically see fewer service gaps, faster escalation response, and one consolidated bill instead of five.</p>
<p>Would you be open to a brief 15-minute call to explore how we could support {{company}}?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 2. Manufacturing

**Name:** `Manufacturing — Intro Outreach`
**Subject A:** `Keeping {{company}}'s plant running without FM headaches`
**Subject B:** `Facility support built for manufacturing uptime`

```html
<p>Hi {{firstName}},</p>
<p>Downtime on the shop floor is expensive, and a lot of it traces back to poorly managed housekeeping, technical maintenance, or security around the plant. We help manufacturing sites like {{company}} keep those functions running reliably, with SLA-backed response times and a single point of accountability.</p>
<p>Happy to share how we've helped similar plants cut vendor-related disruptions. Open to a short call?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 3. Healthcare

**Name:** `Healthcare — Intro Outreach`
**Subject A:** `Hygiene-compliant FM support for {{company}}`
**Subject B:** `Facility management built for healthcare standards`

```html
<p>Hi {{firstName}},</p>
<p>Facilities like {{company}} can't afford lapses in hygiene, infection control, or security — the standards are simply higher. We provide healthcare-trained housekeeping, sanitation, and technical maintenance teams who understand clinical environments, backed by strict SLAs and audit-ready documentation.</p>
<p>I'd welcome the chance to walk you through how we support hospitals and clinics on this — would a short call work?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 4. Education

**Name:** `Education — Intro Outreach`
**Subject A:** `Campus facility support for {{company}}`
**Subject B:** `A safer, cleaner campus for {{company}}`

```html
<p>Hi {{firstName}},</p>
<p>Running a safe, clean, well-maintained campus takes more than one vendor can usually deliver — housekeeping, security at entry points, and upkeep of classrooms and labs all need to work together. We support institutions like {{company}} with an integrated facility team built around academic-year schedules and student safety.</p>
<p>Would love to share how this has worked for other campuses in your region. Open to a quick call?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 5. Corporate

**Name:** `Corporate — Intro Outreach`
**Subject A:** `A cleaner, better-run office for {{company}}`
**Subject B:** `Facility management {{company}}'s team won't have to think about`

```html
<p>Hi {{firstName}},</p>
<p>First impressions at {{company}}'s office — reception, meeting rooms, common areas — often come down to who's running housekeeping and front-of-house support behind the scenes. We handle that end-to-end, along with security and technical maintenance, so your team can stay focused on the business.</p>
<p>Open to a short call to see if there's a fit?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 6. Industrial

**Name:** `Industrial — Intro Outreach`
**Subject A:** `Reliable FM support for {{company}}'s facility`
**Subject B:** `One team for housekeeping, security & maintenance at {{company}}`

```html
<p>Hi {{firstName}},</p>
<p>Industrial sites like {{company}} deal with a different scale of facility management — larger footprints, tighter safety requirements, and less tolerance for missed maintenance windows. We provide integrated housekeeping, security, and technical maintenance teams sized and trained for industrial environments.</p>
<p>Glad to share specifics on how we've supported similar facilities. Would a brief call work?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 7. Retail

**Name:** `Retail — Intro Outreach`
**Subject A:** `Store-ready facility support for {{company}}`
**Subject B:** `Consistent store standards across {{company}} locations`

```html
<p>Hi {{firstName}},</p>
<p>Keeping every {{company}} location looking store-ready — clean, secure, and fully functional — gets harder as you scale across sites. We provide consistent housekeeping, security, and maintenance standards across multiple locations, managed centrally so quality doesn't vary store to store.</p>
<p>Happy to discuss how this could work across your footprint. Open to a short call?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 8. Hospitality

**Name:** `Hospitality — Intro Outreach`
**Subject A:** `Guest-ready facility standards for {{company}}`
**Subject B:** `Facility management that protects {{company}}'s guest experience`

```html
<p>Hi {{firstName}},</p>
<p>In hospitality, facility management isn't back-of-house — it's part of the guest experience. We support properties like {{company}} with housekeeping, security, technical maintenance, and catering-support staff trained to hospitality standards, so every touchpoint holds up to guest expectations.</p>
<p>Would you be open to a short conversation about your current setup?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```

---

## 9. Residential

**Name:** `Residential — Intro Outreach`
**Subject A:** `Facility management for {{company}}'s residential community`
**Subject B:** `A more reliable FM partner for {{company}}`

```html
<p>Hi {{firstName}},</p>
<p>Residents expect clean common areas, responsive security, and maintenance issues resolved quickly — and that reputation rests on whoever's running facility operations. We support residential communities like {{company}} with integrated housekeeping, security, and technical maintenance teams, with clear SLAs your residents will actually notice.</p>
<p>Open to a quick call to discuss your community's needs?</p>

<p style="margin-top:24px">Best regards,<br/>
<strong>VrindaaCorp Services</strong><br/>
Integrated Facility Management — Housekeeping · Security · Technical Maintenance · Catering</p>
```
