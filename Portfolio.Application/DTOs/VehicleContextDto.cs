namespace Portfolio.Application.DTOs;

public record VehicleContextDto
{
    public string Transmission { get; init; } = string.Empty;
    public string? AndroidAutoSupport { get; init; }
    public string? UsbType { get; init; }
    public int? ActionRadiusKm { get; init; }
    public string? SpecialFeatures { get; init; }
}