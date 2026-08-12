const Text = {
  meeting: "Currently in a meeting",
  focus: "Focussing \u2014 Please Do not Disturb"
};

export function Banner({ kind }: { kind: keyof typeof Text }) {
  return <div className={`banner ${kind}`}>{Text[kind]}</div>;
}
