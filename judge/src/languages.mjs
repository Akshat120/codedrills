// How each language is compiled and run. The ids match the web app's list
// (web/src/data/languages.js); adding a language means an entry here and one
// there, plus its compiler in the judge image or Lambda layer.
const GXX = process.env.JUDGE_GXX || "/usr/bin/g++";

export const languages = {
  cpp17: {
    source: "main.cpp",
    compile: (src, exe) => [GXX, "-std=gnu++17", "-O2", "-pipe", "-static", "-DONLINE_JUDGE", "-o", exe, src],
    run: exe => [exe]
  }
};
