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
    body: `Hey [Name],

product designer, 5 years on web3 UX and currently at Rampnow - KYC flows, onramp, offramp, activation drop-offs. the stuff that breaks when you start to scale.

https://methun.design`,
  },
  {
    id: "t2",
    track: "B",
    subject: "this email will take you 30 seconds to read",
    body: `Hey [Name],

product designer, 5 years on web3 UX and currently at Rampnow - KYC flows, onramp, offramp, activation drop-offs. the stuff that breaks when you start to scale.

saw the opening. want me to send some work?

https://methun.design`,
  },
  {
    id: "t3",
    track: "any",
    subject: "this email will take you 30 seconds to read",
    body: `Hey [Name],

product designer, 5 years on web3 UX and currently at Rampnow - KYC flows, onramp, offramp, activation drop-offs. the stuff that breaks when you start to scale.

https://methun.design`,
  },
];

export const FOLLOW_UP_TEMPLATE = `Hey [Name],

just bumping this in case it got buried. happy to send one specific piece of work if that's easier.

https://methun.design`;
