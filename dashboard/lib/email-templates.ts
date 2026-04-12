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
    subject: "this email will take you 30 seconds to read",
    body: `Hi [Name],

product designer, 5 years on web3 UX and currently at Rampnow — KYC flows, onramp, offramp, activation drop-offs, the stuff that breaks when you start to scale.

saw you raised.

Methun
https://methun.design

ps: don't want to hear from me ever again? no worries, my therapist says I need to work on how I cope with rejection. I've survived three crypto winters though. I'll be alright.`,
  },
  {
    id: "t2",
    track: "B",
    subject: "this email will take you 30 seconds to read",
    body: `Hi [Name],

product designer, 5 years on web3 UX and currently at Rampnow — KYC flows, onramp, offramp, activation drop-offs, the stuff that breaks when you start to scale.

saw the opening.

Methun
https://methun.design

ps: don't want to hear from me ever again? no worries, my therapist says I need to work on how I cope with rejection. I've survived three crypto winters though. I'll be alright.`,
  },
  {
    id: "t3",
    track: "any",
    subject: "this email will take you 30 seconds to read",
    body: `Hi [Name],

product designer, 5 years on web3 UX and currently at Rampnow — KYC flows, onramp, offramp, activation drop-offs, the stuff that breaks when you start to scale.

Methun
https://methun.design

ps: don't want to hear from me ever again? no worries, my therapist says I need to work on how I cope with rejection. I've survived three crypto winters though. I'll be alright.`,
  },
];

export const FOLLOW_UP_TEMPLATE = `Hi [Name],

just bumping this in case it got buried. happy to send one specific piece of work if that's easier.

Methun
https://methun.design`;
