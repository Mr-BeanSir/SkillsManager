use std::collections::HashMap;
use std::io::Read;

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum HttpError {
    #[error("http request failed: {0}")]
    Request(String),
    #[error("http response error: {0}")]
    Response(String),
}

fn build_headers(extra: &HashMap<&str, &str>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        "User-Agent",
        HeaderValue::from_static("SkillsManager/0.1"),
    );
    for (key, value) in extra {
        if let (Ok(name), Ok(val)) = (
            HeaderName::from_bytes(key.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            headers.insert(name, val);
        }
    }
    headers
}

pub fn fetch_text(
    url: &str,
    extra_headers: &HashMap<&str, &str>,
) -> Result<String, HttpError> {
    let client = Client::builder()
        .build()
        .map_err(|e| HttpError::Request(e.to_string()))?;

    let headers = build_headers(extra_headers);
    let response = client
        .get(url)
        .headers(headers)
        .send()
        .map_err(|e| HttpError::Request(e.to_string()))?;

    if !response.status().is_success() {
        return Err(HttpError::Response(format!(
            "HTTP {} for {}",
            response.status(),
            url
        )));
    }

    response
        .text()
        .map_err(|e| HttpError::Response(e.to_string()))
}


pub fn download_to_writer(
    url: &str,
    writer: &mut dyn std::io::Write,
    on_chunk: Option<&dyn Fn(u64, u64)>,
) -> Result<u64, HttpError> {
    let client = Client::builder()
        .build()
        .map_err(|e| HttpError::Request(e.to_string()))?;

    let mut headers = HeaderMap::new();
    headers.insert(
        "User-Agent",
        HeaderValue::from_static("SkillsManager"),
    );

    let response = client
        .get(url)
        .headers(headers)
        .send()
        .map_err(|e| HttpError::Request(e.to_string()))?;

    if !response.status().is_success() {
        return Err(HttpError::Response(format!(
            "HTTP {} for {}",
            response.status(),
            url
        )));
    }

    let total_size: u64 = response
        .content_length()
        .unwrap_or(0);

    let mut reader = response;
    let mut downloaded: u64 = 0;
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| HttpError::Response(e.to_string()))?;

        if bytes_read == 0 {
            break;
        }

        writer
            .write_all(&buffer[..bytes_read])
            .map_err(|e| HttpError::Response(e.to_string()))?;

        downloaded += bytes_read as u64;

        if let Some(cb) = on_chunk {
            cb(downloaded, total_size);
        }
    }

    Ok(downloaded)
}
