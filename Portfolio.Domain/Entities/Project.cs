namespace Portfolio.Domain.Entities;

public class Project : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? GithubUrl { get; set; }
    public string? LiveUrl { get; set; }
    public string[] Technologies { get; set; } = Array.Empty<string>();
    public bool IsPrivate { get; set; } // If true, requires authentication to view details
}