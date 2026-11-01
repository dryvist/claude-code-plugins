# Changelog

## [1.11.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.10.4...jpe-ai-delegation-v1.11.0) (2026-11-01)


### Features

* **jpe-ai-delegation:** route [class: public] to the sandbox and [class: text] to LiteLLM small ([#684](https://github.com/dryvist/claude-code-plugins/issues/684)) ([b5c92d0](https://github.com/dryvist/claude-code-plugins/commit/b5c92d01d6bd099ce3a0e75ec0c22459b3d733ae))

## [1.10.4](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.10.3...jpe-ai-delegation-v1.10.4) (2026-11-01)


### Bug Fixes

* **jpe-ai-delegation:** keep private work off the sandbox and drop the GLM rung ([#682](https://github.com/dryvist/claude-code-plugins/issues/682)) ([c8d3465](https://github.com/dryvist/claude-code-plugins/commit/c8d346570ab11dc031c19e64f8844505825df047))

## [1.10.3](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.10.2...jpe-ai-delegation-v1.10.3) (2026-11-01)


### Bug Fixes

* **jpe-ai-delegation:** route every delegation class to Codex Luna ([#679](https://github.com/dryvist/claude-code-plugins/issues/679)) ([e22a900](https://github.com/dryvist/claude-code-plugins/commit/e22a9003cc6a1223e393e0452f152aa0f6887487))

## [1.10.2](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.10.1...jpe-ai-delegation-v1.10.2) (2026-10-31)


### Bug Fixes

* **jpe-ai-delegation:** add the zcode-job sandbox rung to the ladder ([#677](https://github.com/dryvist/claude-code-plugins/issues/677)) ([43ec48b](https://github.com/dryvist/claude-code-plugins/commit/43ec48b593bf8147c96f9adbfa2b276ec2b9a15c))

## [1.10.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.10.0...jpe-ai-delegation-v1.10.1) (2026-10-31)


### Bug Fixes

* **jpe-ai-delegation:** let laya() own the shadow configuration check ([#675](https://github.com/dryvist/claude-code-plugins/issues/675)) ([0d9d1f2](https://github.com/dryvist/claude-code-plugins/commit/0d9d1f27f6fe2bd0be602a642d8a0570f9d2293c))

## [1.10.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.9.0...jpe-ai-delegation-v1.10.0) (2026-10-31)


### Features

* **jpe-ai-delegation:** log Laya shadow labels and confidence ([#673](https://github.com/dryvist/claude-code-plugins/issues/673)) ([e7cd1e6](https://github.com/dryvist/claude-code-plugins/commit/e7cd1e6ce0601ef8254599c28becc2902041f3a3))

## [1.9.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.8.0...jpe-ai-delegation-v1.9.0) (2026-10-30)


### Features

* **jpe-ai-delegation:** reach Laya through the local proxy without a token file ([#671](https://github.com/dryvist/claude-code-plugins/issues/671)) ([8cc3cd4](https://github.com/dryvist/claude-code-plugins/commit/8cc3cd49cac198a04b6e3b9e578c71d28aafa308))

## [1.8.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.7.0...jpe-ai-delegation-v1.8.0) (2026-10-30)


### Features

* **jpe-ai-delegation:** classify spawns with Laya before Codex ([#669](https://github.com/dryvist/claude-code-plugins/issues/669)) ([5e99699](https://github.com/dryvist/claude-code-plugins/commit/5e9969961ff5859d5f1857e52c5af0b39944277d))

## [1.7.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.6.3...jpe-ai-delegation-v1.7.0) (2026-10-28)


### Features

* **jpe-ai-delegation:** route each class to Terra medium/high or Luna xhigh/max ([#659](https://github.com/dryvist/claude-code-plugins/issues/659)) ([9553c2d](https://github.com/dryvist/claude-code-plugins/commit/9553c2d898e0e64f904485b3e95151bc6e07a6c7))

## [1.6.3](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.6.2...jpe-ai-delegation-v1.6.3) (2026-10-25)


### Bug Fixes

* **jpe-ai-delegation:** return a failure hand-back when Codex gives no answer ([#655](https://github.com/dryvist/claude-code-plugins/issues/655)) ([4f4d270](https://github.com/dryvist/claude-code-plugins/commit/4f4d2707ea1aa135d9c54211602d888694ed1596))

## [1.6.2](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.6.1...jpe-ai-delegation-v1.6.2) (2026-10-24)


### Bug Fixes

* **jpe-ai-delegation:** route custom agents defined as Haiku to Codex ([#651](https://github.com/dryvist/claude-code-plugins/issues/651)) ([36504db](https://github.com/dryvist/claude-code-plugins/commit/36504db4737643da40fc8b5e901d736207ebdff0))

## [1.6.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.6.0...jpe-ai-delegation-v1.6.1) (2026-10-24)


### Bug Fixes

* **jpe-ai-delegation:** log why Codex is not ready and allow a slower version probe ([#648](https://github.com/dryvist/claude-code-plugins/issues/648)) ([6fd4291](https://github.com/dryvist/claude-code-plugins/commit/6fd4291d4fc0f39beb84b47cb70f48ff04e1c28f))

## [1.6.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.5.0...jpe-ai-delegation-v1.6.0) (2026-10-24)


### Features

* **jpe-ai-delegation:** read Codex results from -o and log every failure reason ([#646](https://github.com/dryvist/claude-code-plugins/issues/646)) ([aaf0455](https://github.com/dryvist/claude-code-plugins/commit/aaf0455886e5d45df57e05114ebc166a12bcc07b))

## [1.5.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.4.0...jpe-ai-delegation-v1.5.0) (2026-10-24)


### Features

* **jpe-ai-delegation:** add the Z.ai GLM rung to the code and private ladders ([#644](https://github.com/dryvist/claude-code-plugins/issues/644)) ([ff9b5c5](https://github.com/dryvist/claude-code-plugins/commit/ff9b5c5d6dcf3c30e277a737d7486b36889dad7f))

## [1.4.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.3.1...jpe-ai-delegation-v1.4.0) (2026-10-24)


### Features

* **jpe-ai-delegation:** route every class to Codex Luna, Haiku last resort ([#641](https://github.com/dryvist/claude-code-plugins/issues/641)) ([6783688](https://github.com/dryvist/claude-code-plugins/commit/6783688205972d4c1b759957d79b0703d13c24f5))

## [1.3.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.3.0...jpe-ai-delegation-v1.3.1) (2026-10-18)


### Bug Fixes

* **jpe-ai-delegation:** state ZCode PRs open ready with human:review ([#639](https://github.com/dryvist/claude-code-plugins/issues/639)) ([a266820](https://github.com/dryvist/claude-code-plugins/commit/a26682049e56602657addf1d70b8574ad9849e08))

## [1.3.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.2.0...jpe-ai-delegation-v1.3.0) (2026-10-18)


### Features

* **delegation:** Codex-first router, three-kind ladder, startup quota line ([#632](https://github.com/dryvist/claude-code-plugins/issues/632)) ([98530d2](https://github.com/dryvist/claude-code-plugins/commit/98530d2a27478974e515466eed5f42daa61a88e8))

## [1.2.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.1.0...jpe-ai-delegation-v1.2.0) (2026-10-17)


### Features

* **jpe-ai-delegation:** add the agent-route command and a machine-readable ladder ([#626](https://github.com/dryvist/claude-code-plugins/issues/626)) ([f3e09f6](https://github.com/dryvist/claude-code-plugins/commit/f3e09f6446b541aa99cfc1e1a84725c6ba6ca746))

## [1.1.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.0.0...jpe-ai-delegation-v1.1.0) (2026-10-13)


### Features

* **jpe-ai-delegation:** add maintainer-specific delegation ladder plugin ([#613](https://github.com/dryvist/claude-code-plugins/issues/613)) ([0569795](https://github.com/dryvist/claude-code-plugins/commit/05697952f1808478b0b1de7dc67b6fb3bb46603b))
