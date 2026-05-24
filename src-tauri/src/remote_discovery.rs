use serde::{Deserialize, Serialize};
use thiserror::Error;

const DEFAULT_DISCOVER_PAGE_SIZE: u32 = 25;
const SEARCH_REMOTE_BATCH_SIZE: u32 = 100;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDiscoverListState {
    pub entry: String,
    pub page: u32,
    pub query: String,
    pub page_size: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDiscoverSkill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub source_ref: String,
    pub skill_path: String,
    pub tags: Vec<String>,
    pub installs: u32,
    pub updated_at: Option<String>,
    pub is_official: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDiscoverPageResult {
    pub entry: String,
    pub query: String,
    pub page: u32,
    pub page_size: u32,
    pub total_items: u32,
    pub total_pages: u32,
    pub items: Vec<RemoteDiscoverSkill>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkillDetailInput {
    pub source_ref: String,
    pub skill_path: String,
    pub fallback_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkillDetailRecord {
    pub id: String,
    pub name: String,
    pub source_ref: String,
    pub source_url: String,
    pub skill_path: String,
    pub summary: Option<String>,
    pub installs: Option<String>,
    pub github_stars: Option<String>,
    pub first_seen: Option<String>,
    pub security_audits: Option<String>,
    pub tags: Vec<String>,
    pub related_skills: Vec<RemoteRelatedSkill>,
    pub is_official: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRelatedSkill {
    pub name: String,
    pub description: Option<String>,
    pub source_ref: String,
    pub href: String,
}

#[derive(Debug, Error)]
pub enum RemoteDiscoveryError {
    #[error("remote discovery response is missing skills data")]
    MissingSkills,
    #[error("remote discovery response was not valid JSON: {0}")]
    InvalidJson(String),
    #[error("remote discovery request failed: {0}")]
    Request(String),
}

pub fn parse_search_response(
    state: &RemoteDiscoverListState,
    body: &str,
) -> Result<RemoteDiscoverPageResult, RemoteDiscoveryError> {
    let response: SearchResponse = serde_json::from_str(body)
        .map_err(|error| RemoteDiscoveryError::InvalidJson(error.to_string()))?;

    let items = match response.skills {
        Some(serde_json::Value::Array(arr)) => {
            arr.into_iter()
                .filter_map(|value| serde_json::from_value::<WireSkill>(value).ok())
                .map(remote_skill_from_wire)
                .collect::<Vec<_>>()
        }
        _ => Vec::new(),
    };

    let page_size = state.page_size.unwrap_or(DEFAULT_DISCOVER_PAGE_SIZE).max(1);
    let total_items = response.count.unwrap_or(items.len() as u32);
    let total_pages = total_pages(total_items, page_size);
    let page = clamp_page(state.page, total_pages);
    let start = ((page - 1) * page_size) as usize;

    Ok(RemoteDiscoverPageResult {
        entry: state.entry.clone(),
        query: response
            .query
            .unwrap_or_else(|| state.query.trim().to_string()),
        page,
        page_size,
        total_items,
        total_pages,
        items: items
            .into_iter()
            .skip(start)
            .take(page_size as usize)
            .collect(),
    })
}

pub fn parse_embedded_page_response(
    state: &RemoteDiscoverListState,
    body: &str,
) -> Result<RemoteDiscoverPageResult, RemoteDiscoveryError> {
    let skills_json = extract_embedded_skills_json(body)?;
    let skills_value: serde_json::Value = serde_json::from_str(&skills_json)
        .map_err(|error| RemoteDiscoveryError::InvalidJson(error.to_string()))?;

    let skills: Vec<WireSkill> = match skills_value {
        serde_json::Value::Array(arr) => {
            arr.into_iter()
                .filter_map(|value| serde_json::from_value::<WireSkill>(value).ok())
                .collect()
        }
        _ => Vec::new(),
    };

    let total_items = embedded_u32(body, "\\\"totalSkills\\\":")
        .or_else(|| embedded_u32(body, "\"totalSkills\":"))
        .unwrap_or(skills.len() as u32);
    let view = embedded_string(body, "\\\"view\\\":")
        .or_else(|| embedded_string(body, "\"view\":"))
        .unwrap_or_else(|| state.entry.clone());
    let page_size = state.page_size.unwrap_or(DEFAULT_DISCOVER_PAGE_SIZE).max(1);
    let total_pages = total_pages(total_items, page_size);
    let page = clamp_page(state.page, total_pages);
    let start = ((page - 1) * page_size) as usize;
    let page_items = skills
        .into_iter()
        .skip(start)
        .take(page_size as usize)
        .map(remote_skill_from_wire)
        .collect::<Vec<_>>();

    Ok(RemoteDiscoverPageResult {
        entry: view_to_entry(&view, &state.entry),
        query: state.query.trim().to_string(),
        page,
        page_size,
        total_items,
        total_pages,
        items: page_items,
    })
}

fn extract_embedded_skills_json(body: &str) -> Result<String, RemoteDiscoveryError> {
    if let Some(marker_index) = body.find("\\\"initialSkills\\\":[") {
        let array_start = marker_index + "\\\"initialSkills\\\":".len();
        let array_end =
            find_json_array_end(body, array_start).ok_or(RemoteDiscoveryError::MissingSkills)?;
        return Ok(unescape_next_payload(&body[array_start..array_end]));
    }

    if let Some(marker_index) = body.find("\"initialSkills\":[") {
        let array_start = marker_index + "\"initialSkills\":".len();
        let array_end =
            find_json_array_end(body, array_start).ok_or(RemoteDiscoveryError::MissingSkills)?;
        return Ok(body[array_start..array_end].to_string());
    }

    if let Some(marker_index) = body.find("\\\"skills\\\":[") {
        let array_start = marker_index + "\\\"skills\\\":".len();
        let array_end =
            find_json_array_end(body, array_start).ok_or(RemoteDiscoveryError::MissingSkills)?;
        return Ok(unescape_next_payload(&body[array_start..array_end]));
    }

    let total_marker = "\\\"totalSkills\\\":";
    body.find(total_marker)
        .ok_or(RemoteDiscoveryError::MissingSkills)?;
    let array_end_marker = "],\\\"totalSkills\\\":";
    let array_end = body
        .find(array_end_marker)
        .ok_or(RemoteDiscoveryError::MissingSkills)?
        + 1;
    let array_start = body[..array_end]
        .rfind('[')
        .ok_or(RemoteDiscoveryError::MissingSkills)?;

    Ok(unescape_next_payload(&body[array_start..array_end]))
}

#[tauri::command]
pub async fn list_remote_skill_records(
    state: RemoteDiscoverListState,
) -> Result<RemoteDiscoverPageResult, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    let settings =
        crate::settings::read_settings(&connection).map_err(|error| error.to_string())?;
    let configured_page_size = settings.discover_page_size.max(1);
    let normalized = RemoteDiscoverListState {
        entry: normalize_entry(&state.entry),
        page: state.page.max(1),
        query: state.query.trim().to_string(),
        page_size: Some(
            state
                .page_size
                .filter(|page_size| (1..=100).contains(page_size))
                .unwrap_or(configured_page_size),
        ),
    };
    let url = remote_url(&normalized);

    tauri::async_runtime::spawn_blocking(move || {
        let body = fetch_url(&url).map_err(|error| error.to_string())?;

        match (
            normalized.entry.as_str(),
            normalized.query.chars().count() >= 2,
        ) {
            ("search", true) => {
                parse_search_response(&normalized, &body).map_err(|error| error.to_string())
            }
            _ => {
                parse_embedded_page_response(&normalized, &body).map_err(|error| error.to_string())
            }
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_remote_skill_detail_record(
    input: RemoteSkillDetailInput,
) -> Result<RemoteSkillDetailRecord, String> {
    let source_ref = input.source_ref.trim().trim_matches('/').to_string();
    let skill_path = input.skill_path.trim().trim_matches('/').to_string();
    let fallback_name = input.fallback_name;
    let url = format!("https://www.skills.sh/{source_ref}/{skill_path}");

    tauri::async_runtime::spawn_blocking(move || {
        let body = fetch_url(&url).map_err(|error| error.to_string())?;
        let markdown = html2text::from_read(body.as_bytes(), 120);

        Ok(parse_remote_skill_detail_text(
            &markdown,
            &source_ref,
            &skill_path,
            &fallback_name,
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    query: Option<String>,
    skills: Option<serde_json::Value>,
    count: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireSkill {
    id: Option<String>,
    skill_id: Option<String>,
    name: String,
    installs: Option<u32>,
    source: String,
    is_official: Option<bool>,
}

fn remote_skill_from_wire(skill: WireSkill) -> RemoteDiscoverSkill {
    let skill_path = skill.skill_id.unwrap_or_else(|| skill.name.clone());
    let id = skill
        .id
        .unwrap_or_else(|| format!("{}/{}", skill.source, skill_path));

    RemoteDiscoverSkill {
        id,
        name: skill.name,
        description: None,
        source_ref: skill.source,
        skill_path,
        tags: Vec::new(),
        installs: skill.installs.unwrap_or(0),
        updated_at: None,
        is_official: skill.is_official.unwrap_or(false),
    }
}

fn normalize_entry(entry: &str) -> String {
    match entry {
        "trending" | "hot" | "all" => entry.to_string(),
        _ => "search".to_string(),
    }
}

fn remote_url(state: &RemoteDiscoverListState) -> String {
    match state.entry.as_str() {
        "search" if state.query.chars().count() >= 2 => format!(
            "https://www.skills.sh/api/search?q={}&page={}",
            percent_encode(&state.query),
            search_remote_page(
                state.page,
                state.page_size.unwrap_or(DEFAULT_DISCOVER_PAGE_SIZE)
            )
        ),
        "search" => "https://www.skills.sh".to_string(),
        "trending" => "https://www.skills.sh/trending".to_string(),
        "hot" => "https://www.skills.sh/hot".to_string(),
        _ => "https://www.skills.sh".to_string(),
    }
}

fn search_remote_page(page: u32, page_size: u32) -> u32 {
    let item_index = (page.max(1) - 1) * page_size.max(1);
    (item_index / SEARCH_REMOTE_BATCH_SIZE) + 1
}

fn total_pages(total_items: u32, page_size: u32) -> u32 {
    (total_items.max(1) + page_size.max(1) - 1) / page_size.max(1)
}

fn clamp_page(page: u32, total_pages: u32) -> u32 {
    page.max(1).min(total_pages.max(1))
}

fn fetch_url(url: &str) -> Result<String, RemoteDiscoveryError> {
    let mut headers = std::collections::HashMap::new();
    headers.insert("Accept", "application/json,text/html");
    crate::http::fetch_text(url, &headers)
        .map_err(|error| RemoteDiscoveryError::Request(error.to_string()))
}

fn find_json_array_end(body: &str, start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, character) in body[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        if character == '[' {
            depth += 1;
        } else if character == ']' {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return Some(start + offset + character.len_utf8());
            }
        }
    }
    None
}

fn unescape_next_payload(value: &str) -> String {
    value.replace("\\\"", "\"")
}

fn embedded_u32(body: &str, marker: &str) -> Option<u32> {
    let start = body.find(marker)? + marker.len();
    let digits = body[start..]
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect::<String>();
    digits.parse().ok()
}

fn embedded_string(body: &str, marker: &str) -> Option<String> {
    let start = body.find(marker)? + marker.len();
    let quoted = body[start..]
        .strip_prefix("\\\"")
        .or_else(|| body[start..].strip_prefix('"'))?;
    let end = quoted
        .find("\\\"")
        .or_else(|| quoted.find('"'))?;
    Some(quoted[..end].to_string())
}

fn view_to_entry(view: &str, fallback: &str) -> String {
    match view {
        "trending" => "trending".to_string(),
        "hot" => "hot".to_string(),
        "all-time" => "all".to_string(),
        _ => fallback.to_string(),
    }
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            b' ' => vec!['+'],
            _ => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn parse_remote_skill_detail_text(
    text: &str,
    source_ref: &str,
    skill_path: &str,
    fallback_name: &str,
) -> RemoteSkillDetailRecord {
    let lines = text.lines().map(|line| line.trim()).collect::<Vec<_>>();

    let name = lines
        .iter()
        .find_map(|line| line.strip_prefix("# ").map(str::to_string))
        .unwrap_or_else(|| fallback_name.to_string());
    let heading_line = format!("# {name}");
    let tags = lines
        .iter()
        .position(|line| **line == heading_line)
        .map(|start| {
            lines
                .iter()
                .skip(start + 1)
                .take_while(|line| **line != "Installation")
                .filter(|line| !line.is_empty())
                .map(|line| (*line).to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let summary = {
        let items = section_between(&lines, "Summary", "SKILL.md");
        if items.is_empty() {
            None
        } else {
            Some(items.join("\n"))
        }
    };

    RemoteSkillDetailRecord {
        id: format!("{source_ref}/{skill_path}"),
        name,
        source_ref: source_ref.to_string(),
        source_url: format!("https://github.com/{source_ref}"),
        skill_path: skill_path.to_string(),
        summary,
        installs: next_value_after(&lines, "Installs"),
        github_stars: next_value_after(&lines, "GitHub Stars"),
        first_seen: next_value_after(&lines, "First Seen"),
        security_audits: security_audits_after(&lines, "Security Audits"),
        tags,
        related_skills: related_skills_from_lines(&lines),
        is_official: false,
    }
}

fn section_between(lines: &[&str], start_label: &str, end_label: &str) -> Vec<String> {
    let mut collected = Vec::new();
    let mut in_section = false;

    for line in lines {
        if *line == start_label {
            in_section = true;
            continue;
        }
        if !in_section {
            continue;
        }
        if *line == end_label {
            break;
        }
        if !line.is_empty() {
            collected.push((*line).to_string());
        }
    }

    collected
}

fn next_value_after(lines: &[&str], label: &str) -> Option<String> {
    let start = lines.iter().position(|line| *line == label)?;
    lines
        .iter()
        .skip(start + 1)
        .find(|line| !line.is_empty())
        .map(|line| (*line).to_string())
}

fn security_audits_after(lines: &[&str], label: &str) -> Option<String> {
    let start = lines.iter().position(|line| *line == label)?;
    let mut items = Vec::new();
    for line in lines.iter().skip(start + 1) {
        if line.is_empty() {
            if !items.is_empty() {
                break;
            }
            continue;
        }
        if line.starts_with("### ") {
            break;
        }
        items.push((*line).to_string());
    }

    if items.is_empty() {
        None
    } else {
        Some(items.join(" "))
    }
}

fn related_skills_from_lines(lines: &[&str]) -> Vec<RemoteRelatedSkill> {
    let section = section_between(lines, "Related skills", "Installs");
    if section.is_empty() {
        return Vec::new();
    }

    let mut items = Vec::new();
    let mut index = 0usize;

    while index < section.len() {
        let current = section[index].trim();

        if current.is_empty() || current.starts_with("MORE IN ") {
            index += 1;
            continue;
        }

        if index + 2 < section.len() {
            let description = section[index + 1].trim();
            let source_ref = section[index + 2].trim();
            if source_ref.contains('/') {
                items.push(RemoteRelatedSkill {
                    name: current.to_string(),
                    description: (!description.is_empty()).then(|| description.to_string()),
                    source_ref: source_ref.to_string(),
                    href: format!("https://www.skills.sh/{source_ref}/{}", current),
                });
                index += 3;
                continue;
            }
        }

        index += 1;
    }

    items
}

#[cfg(test)]
mod tests {
    use super::{
        parse_embedded_page_response, parse_remote_skill_detail_text, parse_search_response,
        RemoteDiscoverListState,
    };

    #[test]
    fn maps_skills_search_response_to_discover_page() {
        let body = r#"{
            "query": "figma",
            "searchType": "fuzzy",
            "skills": [
                {
                    "id": "figma/mcp-server-guide/figma-use",
                    "skillId": "figma-use",
                    "name": "figma-use",
                    "installs": 2628,
                    "source": "figma/mcp-server-guide"
                }
            ],
            "count": 100,
            "duration_ms": 42
        }"#;

        let page = parse_search_response(&state("search", "figma", 1), body)
            .expect("search response should parse");

        assert_eq!(page.entry, "search");
        assert_eq!(page.query, "figma");
        assert_eq!(page.total_items, 100);
        assert_eq!(page.total_pages, 4);
        assert_eq!(page.page_size, 25);
        assert_eq!(page.items[0].id, "figma/mcp-server-guide/figma-use");
        assert_eq!(page.items[0].source_ref, "figma/mcp-server-guide");
        assert_eq!(page.items[0].skill_path, "figma-use");
        assert_eq!(page.items[0].installs, 2628);
    }

    #[test]
    fn maps_embedded_trending_page_data_to_discover_page() {
        let body = r#"self.__next_f.push([1,"47:{\"skills\":[{\"source\":\"openai/skills\",\"skillId\":\"figma\",\"name\":\"figma\",\"installs\":2556,\"isOfficial\":true},{\"source\":\"antfu/skills\",\"skillId\":\"vitest\",\"name\":\"vitest\",\"installs\":97}],\"totalSkills\":2,\"allTimeTotal\":387494,\"view\":\"trending\"}"])"#;

        let page = parse_embedded_page_response(&state("trending", "", 1), body)
            .expect("embedded page response should parse");

        assert_eq!(page.entry, "trending");
        assert_eq!(page.page_size, 25);
        assert_eq!(page.total_items, 2);
        assert_eq!(page.total_pages, 1);
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].id, "openai/skills/figma");
        assert_eq!(page.items[0].source_ref, "openai/skills");
        assert_eq!(page.items[0].skill_path, "figma");
        assert!(page.items[0].is_official);
    }

    #[test]
    fn maps_current_embedded_trending_page_shape_without_skills_marker() {
        let wrapped = r#"prefix47:{\"items\":[{\"source\":\"jimliu/baoyu-skills\",\"skillId\":\"ignored\",\"name\":\"ignored\",\"installs\":1}],\"skills\":[{\"source\":\"jimliu/baoyu-skills\",\"skillId\":\"baoyu-url-to-markdown\",\"name\":\"baoyu-url-to-markdown\",\"installs\":181},{\"source\":\"greensock/gsap-skills\",\"skillId\":\"gsap-scrolltrigger\",\"name\":\"gsap-scrolltrigger\",\"installs\":179}],\"totalSkills\":9721,\"allTimeTotal\":393626,\"view\":\"trending\"}]\n"])</script>"#;

        let page = parse_embedded_page_response(&state("trending", "", 1), &wrapped)
            .expect("embedded page response should parse");

        assert_eq!(page.entry, "trending");
        assert_eq!(page.total_items, 9721);
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].source_ref, "jimliu/baoyu-skills");
        assert_eq!(page.items[0].skill_path, "baoyu-url-to-markdown");
        assert_eq!(page.items[1].skill_path, "gsap-scrolltrigger");
    }

    #[test]
    fn maps_rsc_all_page_initial_skills_shape() {
        let body = r#"1:"$Sreact.fragment"
0:{"rsc":["$","$1","c",{"children":[["$","$L2",null,{"initialSkills":[{"source":"vercel-labs/skills","skillId":"find-skills","name":"find-skills","installs":1533534,"weeklyInstalls":[108424,100113],"isOfficial":true},{"source":"nuxt/ui","skillId":"nuxt-ui","name":"nuxt-ui","installs":11658,"weeklyInstalls":[751,2413],"isOfficial":true}],"totalSkills":9768,"allTimeTotal":407368,"view":"all-time"}],["$L3","$L4"],"$L5"]}],"isPartial":false}
3:["$","script","script-0",{"src":"/_next/static/chunks/example.js","async":true}]"#;

        let page = parse_embedded_page_response(&state("all", "", 1), body)
            .expect("rsc page response should parse");

        assert_eq!(page.entry, "all");
        assert_eq!(page.total_items, 9768);
        assert_eq!(page.total_pages, 391);
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].source_ref, "vercel-labs/skills");
        assert_eq!(page.items[0].skill_path, "find-skills");
        assert_eq!(page.items[1].source_ref, "nuxt/ui");
        assert_eq!(page.items[1].skill_path, "nuxt-ui");
        assert_eq!(page.items[1].installs, 11658);
        assert!(page.items[1].is_official);
    }

    #[test]
    fn maps_html_wrapped_rsc_initial_skills_shape() {
        let body = r#"<script>self.__next_f.push([1,"0:{\"P\":null}\n48:[\"$\",\"$L2\",null,{\"initialSkills\":[{\"source\":\"vercel-labs/skills\",\"skillId\":\"find-skills\",\"name\":\"find-skills\",\"installs\":1533534,\"weeklyInstalls\":[108424,100113],\"isOfficial\":true},{\"source\":\"nuxt/ui\",\"skillId\":\"nuxt-ui\",\"name\":\"nuxt-ui\",\"installs\":11658,\"weeklyInstalls\":[751,2413],\"isOfficial\":true}],\"totalSkills\":9768,\"allTimeTotal\":407368,\"view\":\"all-time\"}]\n"])</script>"#;

        let page = parse_embedded_page_response(&state("all", "", 1), body)
            .expect("html-wrapped rsc page response should parse");

        assert_eq!(page.entry, "all");
        assert_eq!(page.total_items, 9768);
        assert_eq!(page.total_pages, 391);
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.items[0].skill_path, "find-skills");
        assert_eq!(page.items[1].skill_path, "nuxt-ui");
    }

    #[test]
    fn uses_all_time_page_for_short_search_queries() {
        assert_eq!(
            super::remote_url(&state("search", "", 1)),
            "https://www.skills.sh"
        );
        assert_eq!(
            super::remote_url(&state("search", "f", 1)),
            "https://www.skills.sh"
        );
        assert_eq!(
            super::remote_url(&state("search", "figma", 2)),
            "https://www.skills.sh/api/search?q=figma&page=1"
        );
        assert_eq!(
            super::remote_url(&state_with_page_size("search", "figma", 5, 25)),
            "https://www.skills.sh/api/search?q=figma&page=2"
        );
    }

    #[test]
    fn parses_remote_skill_detail_sections_from_markdown_text() {
        let body = r#"# find-skills

Agent workflows

Installation

Summary

Discover and install specialized agent skills from the open ecosystem when users need extended capabilities.
* Helps identify relevant skills by domain and task

SKILL.md

Installs

1.6M

Repository

vercel-labs/skills

GitHub Stars

19.1K

First Seen

Jan 26, 2026

Security Audits

Gen Agent Trust Hub Pass Socket Pass Snyk Warn

Related skills

MORE IN AGENT WORKFLOWS
skill-creator
Create, test, and publish new skills from within your agent
anthropics/skills
browser-use
Browser automation with visual understanding — interacts with pages based on what it sees
browser-use/browser-use

### Browse"#;

        let detail = parse_remote_skill_detail_text(
            body,
            "vercel-labs/skills",
            "find-skills",
            "find-skills",
        );

        assert_eq!(detail.name, "find-skills");
        assert_eq!(detail.tags, vec!["Agent workflows"]);
        assert_eq!(detail.github_stars.as_deref(), Some("19.1K"));
        assert_eq!(detail.first_seen.as_deref(), Some("Jan 26, 2026"));
        assert!(detail
            .summary
            .as_deref()
            .unwrap_or_default()
            .contains("Discover and install specialized agent skills"));
        assert_eq!(
            detail.security_audits.as_deref(),
            Some("Gen Agent Trust Hub Pass Socket Pass Snyk Warn")
        );
        assert_eq!(detail.related_skills.len(), 2);
        assert_eq!(detail.related_skills[0].name, "skill-creator");
        assert_eq!(
            detail.related_skills[0].description.as_deref(),
            Some("Create, test, and publish new skills from within your agent")
        );
        assert_eq!(detail.related_skills[0].source_ref, "anthropics/skills");
    }

    fn state(entry: &str, query: &str, page: u32) -> RemoteDiscoverListState {
        state_with_page_size(entry, query, page, 25)
    }

    fn state_with_page_size(
        entry: &str,
        query: &str,
        page: u32,
        page_size: u32,
    ) -> RemoteDiscoverListState {
        RemoteDiscoverListState {
            entry: entry.to_string(),
            page,
            query: query.to_string(),
            page_size: Some(page_size),
        }
    }
}
