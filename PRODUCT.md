# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + TypeScript + Vite + Tailwind CSS, React Router, Zustand, Supabase (Postgres, Anonymous Auth, Realtime, RLS, RPC). Hosted on Cloudflare Pages free plan. Specified by the owner in the project brief. Budget 0 THB.

## Users

Thai people in general who want to take part in Loy Krathong online on festival night, mostly on their phones. They arrive as guests, pick a river, build a krathong, write a wish and float it alongside everyone else who is there at the same time.

## Product Purpose

ลอยนำกันเด้อ (renamed from LoyTogether on 23 Nov 2026) is a virtual Loy Krathong festival. Success on launch night (24 November 2026): a real person opens the site, creates a custom krathong, writes a wish, floats it on a shared river, and sees other people's krathongs floating there too.

## Positioning

A shared, live river: krathongs from everyone in the same river appear on every connected screen, and each krathong is built from the visitor's own choices rather than a stock image.

## Operating Context

- One night of heavy use; most visitors on ordinary mobile phones, often on shared or mobile networks.
- No registration: anonymous guest sessions only.
- Six virtual venues modelled on real 2569 Loy Krathong sites: Wat Arun riverside, Lumphini Park, Sukhothai Historical Park, Chiang Mai Ping river, Bueng Phalanchai Roi Et, and Suranaree University of Technology (SUT). Each is one shared public room. The product is not the organiser of any real event.

## Capabilities and Constraints

- Launch scope (owner chose to ship everything before launch): landing, guest identity, six venues, SVG krathong builder with 5 parts, wishes with public/private visibility, realtime floating and presence, private and couple rooms with hashed invite tokens, Couple Moment, ambient water sound, the Loy Krathong song via an embedded YouTube player.
- Deferred: memory card.
- Wishes: max 280 characters, private by default. Private wishes must never reach other users through queries or Realtime.
- Moderation (owner decision): profanity filter in client and database with normalization against spacing, repeats and look-alike letters, plus a report action; a public wish reported 3 times is hidden automatically.
- Supabase free tier limits (about 200 concurrent Realtime connections; project pauses after 7 idle days). The client falls back to periodic refetch when Realtime is unavailable.

## Brand Commitments

- Name: ลอยนำกันเด้อ (Isan for "let's float together"). Thai-only brand.
- Copy: natural Thai, no em dashes, middle-dot separators or trailing ellipses (owner feedback).
- Owner-pinned visual constraints: palette tokens (#090D1C background, #141B32 surface, #F5C76A gold, #A78BFA violet, #263B68 water, #FFF9EC text, #A7AEC4 secondary text), IBM Plex Sans Thai + Playfair Display, fantasy / magical / romantic night festival, no Three.js.

## Evidence on Hand

No user content, testimonials, statistics or photography exist. Participant and krathong counts shown in the product must come from live data, never invented numbers.

## Product Principles

1. The core loop (build, wish, float, see others) must work before anything decorative.
2. Privacy of wishes is enforced by the database, not the UI.
3. It should feel like stepping into a festival, not filling in a form.
4. Works on a cheap phone on a busy night.

## Accessibility & Inclusion

Mobile-first, large touch targets, readable contrast on dark backgrounds, reduced-motion support.
