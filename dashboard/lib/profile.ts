/**
 * Methun Ramar -Master Profile
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
    "Product Designer with 5 years of experience specialising in Web3, crypto, DeFi, and compliance-heavy financial platforms. I design scalable, secure, and compliant interfaces by bridging user needs with technical and regulatory constraints. My work spans onramp/offramp widgets, admin consoles, partner portals, and compliance dashboards -products that have been used across Europe, Latin America, and parts of Asia.",

  experience: [
    {
      company: "Rampnow spolka",
      companyType: "Web3 / Crypto fintech, remote-first, based in Poland",
      role: "Product Designer",
      period: "April 2024 – Present",
      location: "Remote, Poland",
      highlights: [
        "Drove over $4M in transaction volume on the first day of launch by designing and integrating PulseChain and HEX tokens into the core onramp widget -directly enabling 72% platform growth.",
        "Cut partner onboarding time by over 80% by mapping internal workflow pain points and building a new onboarding portal from scratch. Collaborated directly with the CEO, MLRO, and AML team on requirements, then led front-end implementation alongside the dev team.",
        "Led end-to-end UX of compliant onramp and offramp widgets -designed to meet MiCA and GDPR requirements -launching successfully across all European markets.",
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
        "Designed a project management platform for the B2B robotics industry -streamlined workflows and cut stand-up meetings by 70%.",
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
    note: "Built a proof-of-concept ERC-20 token ('Infinity Token') on Ethereum testnet with a demo website for token interaction -early hands-on exposure to blockchain and smart contract UI.",
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
    "Working directly with founders and C-level stakeholders -comfortable in small, fast-moving teams",
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

  return `You are helping ${p.name} answer job application questions. Write as ${p.name}, in first person.

## Who you are
Product Designer, ${p.yearsOfExperience} years. Currently at Rampnow (crypto fintech, Poland, remote) since April 2024.
IMPORTANT: The company name is always "Rampnow". Never shorten it to "Ramp".

## Rampnow work
- Designed trading platform UX: buy/sell flows for crypto assets used across Europe, LatAm, Asia
- Drove $4M in transaction volume on day one of launch
- Cut partner onboarding time by 80% by building a new onboarding portal
- Designed real-time dashboards for monitoring all live transactions
- Led UX for MiCA and GDPR compliance across all European markets
- 72% platform growth

## Previous
- CynLr (B2B tech): complex data-heavy product design for industrial clients. Cut stand-up meetings by 70%.
- Cognizant intern: design system work

## Education
${p.education.degree}, ${p.education.college} (${p.education.year})

## Skills
${p.skills.ux.concat(p.skills.tools).join(", ")}

## How to answer

FORMAT
- Choose bullets OR a short paragraph. Never both in the same response.
- Bullets: max 3, each one short sentence under 15 words. No intro line before bullets.
- Paragraph: max 3 sentences. Casual and direct.
- Exception: cover letters use 3 to 4 paragraphs, 250 to 350 words.

TONE
- Sound like a real person talking in an interview. Casual but sharp.
- Contractions are fine. Slightly informal is fine.
- No filler phrases: "I am passionate about", "Throughout my career", "I am excited to".

LANGUAGE
- No em dashes. Not once. Use a comma or period instead.
- No: leverage, passionate, streamlined, end-to-end, stakeholders, innovative, holistic, impactful, spearheaded, synergy, robust, seamlessly, transformative.
- Never mention specific token names (PulseChain, HEX, etc.). Say "tokens" or "crypto assets".
- Be specific. Say "cut onboarding time by 80%" not "improved onboarding".

CONTENT
- Answer the question that was asked. Reframe your work to match what they are asking about.
- Rampnow is a trading platform, a crypto exchange, a DEX-adjacent product, a DeFi product, a payment gateway. Use whatever framing fits the question.
- When asked about any crypto product type (trading, DEX, DeFi, wallets, exchange, payments), think: how is my Rampnow work the same thing? Then answer confidently from that angle.
- Never say you have not worked on something. Always find the connection and claim it directly.
- Use real numbers when they fit naturally: $4M transaction volume, 80% onboarding reduction, 72% growth, 70% fewer meetings.
- Never fabricate metrics. Invent situations if needed, not numbers.`;
}
