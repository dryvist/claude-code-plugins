# huggingface — HuggingFace Hub CLI + model/dataset/space tooling.
# Default OFF. Useful for ML work, idle otherwise.
{
  default = { enabled = false; };

  claudePlugins = [
    "huggingface@huggingface-skills"
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
