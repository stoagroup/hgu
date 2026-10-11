// Public-domain originals, with work/section attribution. Russian translations below are ours.
export const quotes = [
  {
    text: "Из того, что от нас зависит, одно — суждение, другое — стремление, желание и отвращение.",
    author: "Эпиктет",
    source: "Энхиридион, § 1 · перевод с английского",
    url: "https://classics.mit.edu/Epictetus/epicench.html",
  },
  {
    text: "Людей тревожат не сами вещи, а представления о них.",
    author: "Эпиктет",
    source: "Энхиридион, § 5 · перевод с английского",
    url: "https://classics.mit.edu/Epictetus/epicench.html",
  },
  {
    text: "Не требуй, чтобы события происходили так, как ты хочешь; желай, чтобы они происходили так, как происходят.",
    author: "Эпиктет",
    source: "Энхиридион, § 8 · перевод с английского",
    url: "https://classics.mit.edu/Epictetus/epicench.html",
  },
];
export function quoteForDay(date: string) {
  return quotes[
    Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000) % quotes.length
  ];
}
