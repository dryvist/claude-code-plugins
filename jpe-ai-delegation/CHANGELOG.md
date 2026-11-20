# Changelog

## [1.28.5](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.28.4...jpe-ai-delegation-v1.28.5) (2026-11-20)


### Bug Fixes

* **jpe-ai-delegation:** fall through when a sandbox dispatcher accepts no job ([#864](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/864)) ([a17582d](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/a17582d9e37fdbc2809a693d59f90640dae2140e))

## [1.28.4](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.28.3...jpe-ai-delegation-v1.28.4) (2026-11-20)


### Bug Fixes

* **jpe-ai-delegation:** keep code-tagged spawns off the local rung ([#859](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/859)) ([ee0a4a5](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/ee0a4a5ec99c200d38f9308c8b63ff62d4bbd217))

## [1.28.3](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.28.2...jpe-ai-delegation-v1.28.3) (2026-11-20)


### Bug Fixes

* **jpe-ai-delegation:** route agent types without a file natively and prefer the local-default role ([#857](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/857)) ([049f0fe](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/049f0febab4cc5375983f0994d9540e71db8d054))

## [1.28.2](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.28.1...jpe-ai-delegation-v1.28.2) (2026-11-20)


### Bug Fixes

* **jpe-ai-delegation:** run network work on the in-session last rung ([#854](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/854)) ([768b9bc](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/768b9bcbb91748c954fbc9f55fd3f20bc185c68a))

## [1.28.1](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.28.0...jpe-ai-delegation-v1.28.1) (2026-11-20)


### Bug Fixes

* **jpe-ai-delegation:** mark background spawn results as data ([#852](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/852)) ([9fed9a0](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/9fed9a0d98471c7055a05a8ff0ef1b20d0cbcb02))

## [1.28.0](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.27.1...jpe-ai-delegation-v1.28.0) (2026-11-20)


### Features

* **jpe-ai-delegation:** return background spawns at once and report later ([#850](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/850)) ([fcf8a9c](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/fcf8a9ce53110463faf0ef948a8d0f5ff7e068cc))

## [1.27.1](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.27.0...jpe-ai-delegation-v1.27.1) (2026-11-19)


### Bug Fixes

* **jpe-ai-delegation:** pin Haiku at agent.spawn so the last rung runs ([#847](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/847)) ([33dc434](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/33dc434b9fcae39cf97f686cae702b6e575d5391))
* **jpe-ai-delegation:** stream codex and harness runs past ten minutes ([#848](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/848)) ([b1eb850](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/b1eb850b0222a88fe256f9fb69d5ff633f9a0dfc))

## [1.27.0](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.26.4...jpe-ai-delegation-v1.27.0) (2026-11-17)


### Features

* **jpe-ai-delegation:** Codex runs Luna at xhigh ([#843](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/843)) ([be7c22e](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/be7c22e6c95c6498eff1cb047672a290729044a7))

## [1.26.4](https://github.com/JacobPEvans-ai/claude-code-plugins/compare/jpe-ai-delegation-v1.26.3...jpe-ai-delegation-v1.26.4) (2026-11-17)


### Bug Fixes

* **jpe-ai-delegation:** run child CLIs from the current profile and log why they fail ([#834](https://github.com/JacobPEvans-ai/claude-code-plugins/issues/834)) ([54b2e4c](https://github.com/JacobPEvans-ai/claude-code-plugins/commit/54b2e4c9f2e360ae70bbee32fdc79270e8346e2a))

## [1.26.3](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.26.2...jpe-ai-delegation-v1.26.3) (2026-11-16)


### Bug Fixes

* **jpe-ai-delegation:** ask the classifier and judge models to answer without reasoning ([#825](https://github.com/dryvist/claude-code-plugins/issues/825)) ([4d0b0ec](https://github.com/dryvist/claude-code-plugins/commit/4d0b0eca41e9a3db6a86d863477e34c8fd2357d1))

## [1.26.2](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.26.1...jpe-ai-delegation-v1.26.2) (2026-11-15)


### Bug Fixes

* **jpe-ai-delegation:** give the read-only harness a sandboxed shell that cannot write its directory ([#823](https://github.com/dryvist/claude-code-plugins/issues/823)) ([570dcab](https://github.com/dryvist/claude-code-plugins/commit/570dcab82291951004a61650ae99b75c0b5e77d2))

## [1.26.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.26.0...jpe-ai-delegation-v1.26.1) (2026-11-15)


### Bug Fixes

* **jpe-ai-delegation:** log the caught error text when a harness or Codex call throws ([#821](https://github.com/dryvist/claude-code-plugins/issues/821)) ([2ae2940](https://github.com/dryvist/claude-code-plugins/commit/2ae2940f88d84e862f09ce375f737c391cf1fa38))

## [1.26.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.25.2...jpe-ai-delegation-v1.26.0) (2026-11-15)


### Features

* **agent:** zcode run j-562d15ab696af32c ([b6f4063](https://github.com/dryvist/claude-code-plugins/commit/b6f4063aa4681bca774873c3045b7e874daf93db))
* **jpe-ai-delegation:** add a harness transport with two local executor rows ([#817](https://github.com/dryvist/claude-code-plugins/issues/817)) ([b6f4063](https://github.com/dryvist/claude-code-plugins/commit/b6f4063aa4681bca774873c3045b7e874daf93db))

## [1.25.2](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.25.1...jpe-ai-delegation-v1.25.2) (2026-11-15)


### Bug Fixes

* **jpe-ai-delegation:** keep utility calls local and read the Codex quota natively ([#812](https://github.com/dryvist/claude-code-plugins/issues/812)) ([e72f2cb](https://github.com/dryvist/claude-code-plugins/commit/e72f2cb471d5832c83649983d73e8ab93b20e0e7))

## [1.25.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.25.0...jpe-ai-delegation-v1.25.1) (2026-11-14)


### Bug Fixes

* **jpe-ai-delegation:** pass the public-data marker when dispatching a sandbox job ([#808](https://github.com/dryvist/claude-code-plugins/issues/808)) ([fa81f39](https://github.com/dryvist/claude-code-plugins/commit/fa81f3981be3fde31368270fc3da5f6ef0067569))

## [1.25.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.24.0...jpe-ai-delegation-v1.25.0) (2026-11-14)


### Features

* **jpe-ai-delegation:** add a Qwen sandbox executor row ([#806](https://github.com/dryvist/claude-code-plugins/issues/806)) ([c5dfe87](https://github.com/dryvist/claude-code-plugins/commit/c5dfe876dcbd52c620c6c3de292077182a012403))

## [1.24.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.23.1...jpe-ai-delegation-v1.24.0) (2026-11-14)


### Features

* **jpe-ai-delegation:** classify untagged spawns on the on-host small model ([#803](https://github.com/dryvist/claude-code-plugins/issues/803)) ([a9fb5d0](https://github.com/dryvist/claude-code-plugins/commit/a9fb5d0b7fceb650999966bb66959a3aefe7b86b))

## [1.23.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.23.0...jpe-ai-delegation-v1.23.1) (2026-11-14)


### Bug Fixes

* **jpe-ai-delegation:** pass the last rung through without changing the call ([#800](https://github.com/dryvist/claude-code-plugins/issues/800)) ([1f2fd08](https://github.com/dryvist/claude-code-plugins/commit/1f2fd0828f5cdf55eede4cc142a50b263f3e4f29))

## [1.23.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.22.0...jpe-ai-delegation-v1.23.0) (2026-11-14)


### Features

* **agent:** zcode run j-64c269e98a353aab ([43df549](https://github.com/dryvist/claude-code-plugins/commit/43df549f24afe2a7eca0c2df8666bded3a3be8d5))
* **jpe-ai-delegation:** infer the repository from prompt paths ([#798](https://github.com/dryvist/claude-code-plugins/issues/798)) ([43df549](https://github.com/dryvist/claude-code-plugins/commit/43df549f24afe2a7eca0c2df8666bded3a3be8d5))

## [1.22.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.21.0...jpe-ai-delegation-v1.22.0) (2026-11-13)


### Features

* **jpe-ai-delegation:** send a bearer token on the quota query ([#792](https://github.com/dryvist/claude-code-plugins/issues/792)) ([f1f2b91](https://github.com/dryvist/claude-code-plugins/commit/f1f2b918319707bfa8fbd48501afe95f17934e72))

## [1.21.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.20.0...jpe-ai-delegation-v1.21.0) (2026-11-12)


### Features

* **delegation:** read sandbox job outcomes and fall through on ended jobs ([#779](https://github.com/dryvist/claude-code-plugins/issues/779)) ([af8146d](https://github.com/dryvist/claude-code-plugins/commit/af8146d4639cfa8e98e986a6b31cc4e24aab7627))

## [1.20.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.19.0...jpe-ai-delegation-v1.20.0) (2026-11-12)


### Features

* **jpe-ai-delegation:** daily budget rows and router-chat transport ([#778](https://github.com/dryvist/claude-code-plugins/issues/778)) ([a013135](https://github.com/dryvist/claude-code-plugins/commit/a0131350c707d6343d2357bd457a18b3787f8968))

## [1.19.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.18.0...jpe-ai-delegation-v1.19.0) (2026-11-11)


### Features

* **jpe-ai-delegation:** rank executors by usage pace ([#785](https://github.com/dryvist/claude-code-plugins/issues/785)) ([d863515](https://github.com/dryvist/claude-code-plugins/commit/d863515597aa77b003c83e996190e3f333659e40))

## [1.18.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.17.1...jpe-ai-delegation-v1.18.0) (2026-11-11)


### Features

* **jpe-ai-delegation:** write one route line for every Agent routing call ([#782](https://github.com/dryvist/claude-code-plugins/issues/782)) ([0144274](https://github.com/dryvist/claude-code-plugins/commit/0144274baa2cd2ce69ff1355b555329510f7ad2c))

## [1.17.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.17.0...jpe-ai-delegation-v1.17.1) (2026-11-11)


### Bug Fixes

* **jpe-ai-delegation:** read gateway model variables by literal name ([#780](https://github.com/dryvist/claude-code-plugins/issues/780)) ([9b6f2d2](https://github.com/dryvist/claude-code-plugins/commit/9b6f2d2dc2fa156f241efc88744d48b420a4f381))

## [1.17.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.16.0...jpe-ai-delegation-v1.17.0) (2026-11-11)


### Features

* **jpe-ai-delegation:** read executor quota from the metrics store ([#773](https://github.com/dryvist/claude-code-plugins/issues/773)) ([a3dc41a](https://github.com/dryvist/claude-code-plugins/commit/a3dc41afbf39a4a009f409cf9c02d69ca312f441))

## [1.16.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.15.0...jpe-ai-delegation-v1.16.0) (2026-11-11)


### Features

* **jpe-ai-delegation:** load executors from a validated table with price, peak and promotions ([#771](https://github.com/dryvist/claude-code-plugins/issues/771)) ([bbcaa17](https://github.com/dryvist/claude-code-plugins/commit/bbcaa1791bf2aab80c6abe3a576427e5b2617bcf))

## [1.15.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.14.0...jpe-ai-delegation-v1.15.0) (2026-11-10)


### Features

* **jpe-ai-delegation:** add a Cursor sandbox executor ([#769](https://github.com/dryvist/claude-code-plugins/issues/769)) ([127876f](https://github.com/dryvist/claude-code-plugins/commit/127876f3f23ffe66420da24287ead98c133d8892))

## [1.14.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.13.0...jpe-ai-delegation-v1.14.0) (2026-11-10)


### Features

* **jpe-ai-delegation:** place Agent spawns by eligibility, local fit and quota score ([#767](https://github.com/dryvist/claude-code-plugins/issues/767)) ([91d5657](https://github.com/dryvist/claude-code-plugins/commit/91d56573b12fe60b73065ee767a467ce1bb1e880))

## [1.13.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.12.4...jpe-ai-delegation-v1.13.0) (2026-11-09)


### Features

* **delegation:** route ZCode or Codex by sensitivity, other subscriptions, then Haiku; the orchestrator never works solo ([#736](https://github.com/dryvist/claude-code-plugins/issues/736)) ([c90adc5](https://github.com/dryvist/claude-code-plugins/commit/c90adc50445e8a60229bf12e50d2c2743cd7c439))

## [1.12.4](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.12.3...jpe-ai-delegation-v1.12.4) (2026-11-07)


### Bug Fixes

* **jpe-ai-delegation:** keep write tools without Bash on native agents ([#728](https://github.com/dryvist/claude-code-plugins/issues/728)) ([5bbbc42](https://github.com/dryvist/claude-code-plugins/commit/5bbbc428c90e84de096069c37732c0515763c4c0))

## [1.12.3](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.12.2...jpe-ai-delegation-v1.12.3) (2026-11-07)


### Bug Fixes

* **delegation:** keep custom agent tool limits across routing ([#725](https://github.com/dryvist/claude-code-plugins/issues/725)) ([feba7cb](https://github.com/dryvist/claude-code-plugins/commit/feba7cbe243e897cda3617e17f78beae4cba04df))

## [1.12.2](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.12.1...jpe-ai-delegation-v1.12.2) (2026-11-06)


### Bug Fixes

* **jpe-ai-delegation:** close review gaps and restore harness tests ([#700](https://github.com/dryvist/claude-code-plugins/issues/700)) ([935918a](https://github.com/dryvist/claude-code-plugins/commit/935918af8d255de57c8ae385d8435b898e1c79b6))

## [1.12.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.12.0...jpe-ai-delegation-v1.12.1) (2026-11-06)


### Bug Fixes

* **jpe-ai-delegation:** enforce the binding delegation routing ([#698](https://github.com/dryvist/claude-code-plugins/issues/698)) ([7135611](https://github.com/dryvist/claude-code-plugins/commit/71356119420d8658eddb09355d9fc947b319ffb7))

## [1.12.0](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.11.1...jpe-ai-delegation-v1.12.0) (2026-11-04)


### Features

* **agent:** autonomous zcode run j-fae1382ba350cc89 ([#691](https://github.com/dryvist/claude-code-plugins/issues/691)) ([565834d](https://github.com/dryvist/claude-code-plugins/commit/565834da9a833daaeeabeb88306946ae16a1da39))

## [1.11.1](https://github.com/dryvist/claude-code-plugins/compare/jpe-ai-delegation-v1.11.0...jpe-ai-delegation-v1.11.1) (2026-11-04)


### Bug Fixes

* **jpe-ai-delegation:** find codex-quota outside the hook PATH ([#688](https://github.com/dryvist/claude-code-plugins/issues/688)) ([c46c92b](https://github.com/dryvist/claude-code-plugins/commit/c46c92b5b4f8deff59b74eb7f863b653d0342418))

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
