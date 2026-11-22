use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Credential storage error: {0}")]
    Credential(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Provider error: {0}")]
    Provider(String),

    #[error("MCP protocol error: {0}")]
    Mcp(String),

    #[error("Skill error: {0}")]
    Skill(String),

    #[error("Workflow error: {0}")]
    Workflow(String),

    #[error("SSH error: {0}")]
    Ssh(String),

    #[error("Browser automation error: {0}")]
    Browser(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Execution cancelled")]
    Cancelled,
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Validation(err.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
