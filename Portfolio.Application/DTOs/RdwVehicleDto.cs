namespace Portfolio.Application.DTOs;

public record RdwVehicleDto
{
    public string Make { get; init; } = string.Empty;
    public string Model { get; init; } = string.Empty;
    public int BuildYear { get; init; }
    public string Type { get; init; } = string.Empty;
    public string Variant { get; init; } = string.Empty;
    public string Uitvoering { get; init; } = string.Empty;
}