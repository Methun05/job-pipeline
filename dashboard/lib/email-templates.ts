export type EmailTemplate = {
  id: "t1" | "t2" | "t3";
  track: "A" | "B" | "any";
  subject: string;
  body: string;
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "t1",
    track: "A",
    subject: "quick thought on [product]",
    body: `Hey [Name],

saw you raised - congrats.

looks like you're building in a similar space.

I work on onramp UX at Rampnow - mostly around KYC flows, APIs and conversion.

curious how you're thinking about onboarding as you scale.

ps: no reply is fine. I've survived three crypto winters. I can handle this :)`,
  },
  {
    id: "t2",
    track: "B",
    subject: "quick question",
    body: `Hey [Name]

product designer at Rampnow. deep in UX - both the partner side and end-user conversion. KYC drop-offs, payment success rates, the flows that make or break activation.

looks like we're solving the same problems from different angles.

want me to send some work?

P.s. Don't want to hear from me ever again? No worries, my therapist says I need to work on how I cope with rejection. Just reply and let me know. I'll be alright, I hope.`,
  },
  {
    id: "t3",
    track: "any",
    subject: "quick thought on [product]",
    body: `Hey [Name],

product designer at Rampnow - working on both partner-side flows and end-user conversion.

a lot of it is KYC friction + drop-offs across both layers.

feels like you're dealing with similar stuff!

P.s. Don't want to hear from me ever again? No worries, my therapist says I need to work on how I cope with rejection. Just reply and let me know. I'll be alright, I hope.`,
  },
];

export const FOLLOW_UP_TEMPLATE = `Hey [Name],

just bumping this in case it got buried.

happy to send one specific piece of work if that's easier.`;
