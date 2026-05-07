# huggingface — HuggingFace Hub CLI + model/dataset/space tooling.
# Default OFF. Useful for ML work, idle otherwise.
#
# The huggingface-skills marketplace contains 13 individual plugins (one per
# skill). Each plugin's name matches its SKILL.md folder name, so
# claudePlugins and skills here mirror each other.
{
  default = { enabled = false; };

  claudePlugins = [
    "hf-cli@huggingface-skills"
    "transformers-js@huggingface-skills"
    "huggingface-best@huggingface-skills"
    "huggingface-community-evals@huggingface-skills"
    "huggingface-datasets@huggingface-skills"
    "huggingface-gradio@huggingface-skills"
    "huggingface-llm-trainer@huggingface-skills"
    "huggingface-local-models@huggingface-skills"
    "huggingface-paper-publisher@huggingface-skills"
    "huggingface-papers@huggingface-skills"
    "huggingface-tool-builder@huggingface-skills"
    "huggingface-trackio@huggingface-skills"
    "huggingface-vision-trainer@huggingface-skills"
  ];

  skills = [
    "hf-cli"
    "transformers-js"
    "huggingface-best"
    "huggingface-community-evals"
    "huggingface-datasets"
    "huggingface-gradio"
    "huggingface-llm-trainer"
    "huggingface-local-models"
    "huggingface-paper-publisher"
    "huggingface-papers"
    "huggingface-tool-builder"
    "huggingface-trackio"
    "huggingface-vision-trainer"
  ];

  claudeCommands = [ ];
}
