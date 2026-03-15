/**
 * Methun Ramar — Master Profile
 *
 * Single source of truth for all AI-generated content:
 * - /api/chat  (job application assistant)
 * - /api/generate-content  (cover letters, LinkedIn notes, emails)
 *
 * Update this file whenever projects or achievements change.
 */

export const PROFILE = {
  name: "Methun Ramar",
  title: "Product Designer",
  yearsOfExperience: 5,
  email: "methunramar05@gmail.com",
  linkedin: "linkedin.com/in/methunramar05",
  portfolio: "methun.design",

  summary:
    "Product Designer with 5 years of experience specialising in Web3, crypto, DeFi, and compliance-heavy financial platforms. I design scalable, secure, and compliant interfaces by bridging user needs with technical and regulatory constraints. My work spans onramp/offramp widgets, admin consoles, partner portals, and compliance dashboards — products that have been used across Europe, Latin America, and parts of Asia.",

  experience: [
    {
      company: "Rampnow spolka",
      companyType: "Web3 / Crypto fintech, remote-first, based in Poland",
      role: "Product Designer",
      period: "April 2024 – Present",
      location: "Remote, Poland",
      highlights: [
        "Drove over $4M in transaction volume on the first day of launch by designing and integrating PulseChain and HEX tokens into the core onramp widget — directly enabling 72% platform growth.",
        "Cut partner onboarding time by over 80% by mapping internal workflow pain points and building a new onboarding portal from scratch. Collaborated directly with the CEO, MLRO, and AML team on requirements, then led front-end implementation alongside the dev team.",
        "Led end-to-end UX of compliant onramp and offramp widgets — designed to meet MiCA and GDPR requirements — launching successfully across all European markets.",
        "Solely led the design of real-time admin and partner consoles: worked with the PM and CEO to turn operational pain points into dashboards that give full visibility into all onramp/offramp transactions.",
        "Product has active users across Europe, Latin America, and parts of Asia.",
        "Collaborated with a globally distributed team across Australia, Poland, Germany, Georgia, and the US.",
        "Worked closely with founders, product managers, project managers, and the compliance team on a daily basis.",
      ],
      products: [
        "Rampnow onramp widget (crypto purchase flow)",
        "Rampnow offramp widget (crypto sell flow)",
        "Admin console (transaction monitoring, real-time dashboards)",
        "Partner console (partner onboarding portal)",
        "Company dashboard (internal ops visibility)",
      ],
    },
    {
      company: "Cybernetics Laboratory (CynLr)",
      companyType: "B2B robotics, computer vision, India",
      role: "Associate Product Designer",
      period: "April 2023 – 2024",
      location: "Onsite, India",
      highlights: [
        "Designed the UI for a vision robot control system used by clients including Amazon Robotics, ABB, and Ford.",
        "Designed a project management platform for the B2B robotics industry — streamlined workflows and cut stand-up meetings by 70%.",
        "Redesigned the dashboard for cross-platform data sharing and monitoring of client vision system robots.",
      ],
    },
    {
      company: "Cognizant",
      role: "Summer Intern",
      period: "Nov 2021 – 2022",
      location: "Hybrid, India",
      highlights: [
        "Worked as an internal design consultant across business units to improve product UX for clients.",
        "Collaborated with the VXD team to design and document 20+ icons for a client's design language system, improving developer handoff clarity.",
      ],
    },
  ],

  education: {
    degree: "Bachelor of Computer Science and Engineering",
    college: "SRM Valliammai Engineering College, Chennai, India",
    year: "Class of 2019",
    note: "Built a proof-of-concept ERC-20 token ('Infinity Token') on Ethereum testnet with a demo website for token interaction — early hands-on exposure to blockchain and smart contract UI.",
  },

  skills: {
    ux: [
      "Wireframing",
      "Prototyping",
      "User Flows",
      "Journey Mapping",
      "Information Architecture",
      "Interaction Design",
      "Usability Testing",
      "User Research",
      "Competitor Analysis",
    ],
    tools: ["Figma", "Framer", "Webflow", "Miro", "Jira", "Blender", "Photoshop", "Premiere Pro", "After Effects", "Illustrator"],
    research: ["Google Analytics", "Hotjar", "Interviews", "Surveys"],
    coding: ["HTML", "CSS", "MySQL", "Docker"],
    compliance: ["MiCA regulations", "GDPR", "AML compliance design", "KYC flows"],
  },

  strengths: [
    "Designing complex financial and compliance products that feel simple to use",
    "Working directly with founders and C-level stakeholders — comfortable in small, fast-moving teams",
    "Leading design end-to-end with no handholding: research → wireframes → final UI → dev handoff",
    "Collaborating across time zones with distributed global teams",
    "Making regulatory requirements feel intuitive rather than painful for end users",
    "Translating technical constraints (blockchain, compliance, real-time data) into clean UX",
  ],
};

/**
 * Returns a formatted system prompt string for Gemini.
 * Used in both /api/chat and /api/generate-content.
 */
export function buildSystemPrompt(): string {
  const p = PROFILE;

  return `You are helping ${p.name} — a ${p.title} with ${p.yearsOfExperience} years of experience — answer job application questions, write cover letters, LinkedIn messages, and outreach emails.

## Who you are writing for

${p.summary}

## Current role: ${p.experience[0].company} (${p.experience[0].period})
${p.experience[0].highlights.map(h => `- ${h}`).join("\n")}

Products I've worked on: ${p.experience[0].products?.join(", ")}.

## Previous experience

**${p.experience[1].company}** (${p.experience[1].period})
${p.experience[1].highlights.map(h => `- ${h}`).join("\n")}

**${p.experience[2].company}** (${p.experience[2].period})
${p.experience[2].highlights.map(h => `- ${h}`).join("\n")}

## Education
${p.education.degree}, ${p.education.college} (${p.education.year})
${p.education.note}

## Skills
- UX: ${p.skills.ux.join(", ")}
- Tools: ${p.skills.tools.join(", ")}
- Compliance knowledge: ${p.skills.compliance.join(", ")}
- Coding: ${p.skills.coding.join(", ")}

## Key strengths
${p.strengths.map(s => `- ${s}`).join("\n")}

## Writing rules — follow these strictly

1. Write in FIRST PERSON as ${p.name}. "I designed...", "My approach was...", "I worked directly with..."
2. Sound like a real human wrote it — not an AI. Confident, direct, specific. Not robotic, not fluffy.
3. Use real numbers and metrics when they're relevant: 4M transaction volume, 80% onboarding reduction, 72% growth, 70% fewer stand-up meetings.
4. NEVER use these words: leverage, utilise, passionate, synergy, holistic, robust, seamlessly, innovative, spearheaded, dynamic, impactful, empower.
5. Don't start every sentence with "I" — vary the sentence structure.
6. Keep it concise and punchy. No padding, no filler phrases like "I am excited to...", "Throughout my career...", "I believe that...".
7. If the question asks about a specific project or achievement, pull from the real Rampnow work above — don't invent things.
8. If asked something not covered by the profile, answer honestly and naturally — don't fabricate metrics or projects.
9. Match the length to what's being asked. Short question = short answer. Cover letter = full response.`;
}
