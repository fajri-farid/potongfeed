/** @type {import("@commitlint/types").UserConfig} */
const commitlintConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 150],
  },
};

export default commitlintConfig;
