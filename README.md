d# TeachAura

**Teach Smarter. Prepare Better.**

TeachAura is an AI-powered teacher productivity platform that plans, prepares, organises and guides teaching activities, so teachers can spend their time and energy on what matters most: teaching.

Initial market: **Nigeria** · Users: **primary and secondary school teachers** · Platform: **web application**

> **Status:** In development. This README reflects the product requirements (PRD v1.0). Setup steps and the tech stack are initial recommendations and may change.

---

## Why TeachAura

Teachers spend a large share of their time preparing lesson notes, assignments, class activities and assessments, and organising their schedules. That workload takes time away from actual teaching.

TeachAura brings curriculum planning, lesson preparation, teaching guidance, assessment generation and progress tracking into one workspace.

**Core principle:** AI does the preparation and provides the guidance. The teacher makes the decisions.

---

## Key Features

### Curriculum intelligence
Upload a syllabus (PDF, DOCX or DOC). TeachAura extracts topics, subtopics, learning objectives and expected coverage, then combines them with the term dates and timetable to propose a teaching schedule. Teachers review and approve it before it takes effect.

### AI teaching assistant
For every scheduled lesson, TeachAura generates:

- **Lesson preparation:** objectives, previous knowledge, materials, introduction, procedures, explanations, examples, activities, evaluation and conclusion
- **Teacher's lesson note:** a comprehensive, professional note
- **Students' short note:** a simplified version students can copy into their notebooks
- **Teaching guide:** step-by-step instructions for delivering the lesson

All generated materials are editable.

### Guided Teaching Mode
The platform walks teachers through a lesson in timed stages, similar to a guided workout.

| Stage | Example duration (45-min lesson) |
|---|---|
| Introduction | 5 min |
| Concept explanation | 15 min |
| Class activities | 10 min |
| Evaluation | 10 min |
| Conclusion | 5 min |

Teachers can **start, pause, continue, extend, skip or complete** any stage. The timer guides the teacher but never forces a rigid schedule.

### Assessment and question generator
Optional and on demand. Generate multiple-choice, theory, fill-in-the-gap, true or false and short-answer questions, with control over class, subject, topic, number of questions, difficulty, marks, duration, answer key and marking scheme. Teachers edit and approve everything.

### Weekly planner and progress tracking
Each week TeachAura checks what was scheduled, completed and outstanding, then recommends how to redistribute remaining topics around missed lessons, public holidays, school closures and timetable changes. It flags when a teacher is falling behind without overloading future weeks. Teachers approve every adjustment.

### Achievements
Teaching streaks, weekly consistency badges, lesson completion badges, monthly milestones and syllabus completion recognition. The system encourages consistency without punishing legitimate disruptions.

### Dashboard
Overview, My Classes, My Subjects, Weekly Planner, Lesson Preparation, Teaching Calendar, Progress Tracker, Achievements and Settings. Each class and subject keeps its own academic records.

---

## Tech Stack (proposed)

| Layer | Technology |
|---|---|
| Frontend | React, Next.js, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| File storage | Supabase Storage |
| AI | Large Language Model API |
| Document processing | PDF and DOCX extraction |
| Hosting | Vercel or suitable cloud infrastructure |

---

## AI Components

1. Syllabus Extraction Engine
2. Curriculum Analysis Engine
3. Lesson Generation Engine
4. Teaching Guidance Engine
5. Question Generation Engine
6. Weekly Planning Engine
7. Progress Analysis Engine

All AI-generated educational material must be reviewable by teachers before use, and aligned with the uploaded syllabus.

---

## Roadmap

- [ ] **Phase 1, Foundation:** authentication, dashboard, class and subject management, syllabus upload, timetable configuration
- [ ] **Phase 2, AI intelligence:** syllabus analysis, curriculum organisation, weekly lesson planning, lesson note and students' short note generation
- [ ] **Phase 3, Teaching experience:** Guided Teaching Mode, session timers, teaching instructions, interactive lesson controls
- [ ] **Phase 4, Assessment:** question, assignment and classwork generators, answer keys, marking schemes
- [ ] **Phase 5, Progress and engagement:** weekly progress, syllabus coverage, outstanding lesson tracking, streaks, badges

---

## Getting Started

> Replace the commands below with your actual project setup as it develops.

```bash
# Clone the repository
git clone https://github.com/<your-username>/teachaura.git
cd teachaura

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local

# Run the development server
npm run dev
```

You will need accounts and keys for the services in the stack, such as Supabase and your chosen LLM provider. List the required variables in `.env.example`.

---

## Design

- **Personality:** intelligent, professional, supportive, organised, modern, empowering
- **Style:** minimalist SaaS interface with rounded cards, consistent spacing and subtle transitions. It should never look like a children's educational app.
- **Typography:** Inter (primary), DM Sans (secondary)

| Role | Colour | Hex |
|---|---|---|
| Primary | Deep Teal | `#0F766E` |
| Secondary | Dark Teal | `#134E4A` |
| Soft accent | Soft Mint | `#D1FAE5` |
| Background | Warm White | `#F8FAF9` |
| Cards | Pure White | `#FFFFFF` |
| Accent | Golden Amber | `#F4B740` |
| Text | Slate | `#334155` |
| Borders | Soft Grey | `#E2E8F0` |

**Logo direction:** "The Teaching Flow", an abstract symbol of Planning → Preparation → Teaching → Assessment → Improvement.

---

## Non-Functional Priorities

Data security, user privacy, fast response times, mobile responsiveness, ease of navigation, reliable document processing, secure authentication, scalable architecture and reliable AI integrations. Teachers keep appropriate control over their uploaded documents and generated materials.

---

## Success Metrics

Registered and active teachers, syllabuses successfully processed, lessons prepared, time saved on preparation, weekly retention, completed teaching sessions, teacher satisfaction and accuracy of generated materials.

---

## Philosophy

TeachAura is not built to replace teachers. It removes unnecessary administrative stress so teachers can concentrate on teaching.

> A teacher should never have to start their teaching preparation from scratch every day.

**AI does the preparation. AI provides the guidance. The teacher makes the decisions.**

---

## Contributing

Contributions, issues and feature ideas are welcome. Open an issue to discuss what you'd like to change before submitting a pull request.

## License

Add your chosen license here (for example MIT) and include a `LICENSE` file in the repository.
