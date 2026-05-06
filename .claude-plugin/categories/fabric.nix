# fabric — Daniel Miessler's prompt patterns (analyze_*, extract_*, etc.).
# Default OFF. Curated subset of 252+ patterns; useful for content analysis
# but rarely day-to-day code work.
{
  default = { enabled = false; };

  claudePlugins = [
    "fabric-patterns@fabric-patterns"
  ];

  skills = [
    "extract_wisdom"
    "extract_main_idea"
    "extract_insights"
    "extract_recommendations"
    "extract_references"
    "analyze_paper"
    "analyze_prose"
    "analyze_answers"
    "analyze_logs"
    "analyze_incident"
    "analyze_risk"
    "analyze_comments"
    "analyze_threat_report"
    "find_logical_fallacies"
    "rate_content"
    "create_prd"
    "create_design_document"
    "create_stride_threat_model"
    "create_threat_scenarios"
    "create_git_diff_commit"
    "create_command"
    "create_summary"
    "create_coding_feature"
    "summarize"
    "summarize_git_changes"
    "summarize_meeting"
    "improve_writing"
    "humanize"
    "write_pull-request"
    "write_essay"
    "review_code"
    "explain_code"
    "clean_text"
  ];

  claudeCommands = [ ];
}
