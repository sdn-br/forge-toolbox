/** whether two times fall on the same calendar day, in the local time zone */
export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** the stored answer "Später" of an offer, asked again only on another day */
export const answeredLaterToday = (answer: { answer: string; at?: number } | null | undefined, now: number) =>
  answer?.answer === 'later' && answer.at !== undefined && sameDay(answer.at, now);
