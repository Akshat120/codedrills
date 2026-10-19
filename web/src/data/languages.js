// Languages a submission can use. The judge will need a matching compile/run
// command for each id; adding one here is all the web app needs. Only C++17 is
// listed until the judge supports more (see docs/DESIGN.md).
export const languages = [
  { id: "cpp17", name: "GNU C++17", extensions: [".cpp", ".cc", ".cxx"] }
];

export const languageName = id => languages.find(l => l.id === id)?.name || id;
