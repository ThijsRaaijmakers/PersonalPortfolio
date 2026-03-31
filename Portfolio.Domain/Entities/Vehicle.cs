namespace Portfolio.Domain.Entities;

public class Vehicle : BaseEntity
{
    // RDW Data (Deterministic)
    public string LicensePlate { get; set; } = string.Empty;
    public string Make { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public int BuildYear { get; set; }
    public string FuelType { get; set; } = string.Empty;
    public string Variant { get; set; } = string.Empty;
    public int? HorsePower { get; set; } 

    // AI Enriched Data (Contextual)
    public string Transmission { get; set; } = string.Empty; // e.g., "Manual", "Automatic"
    public string? AndroidAutoSupport { get; set; } // e.g., "Wired", "Wireless", "None"
    public string? UsbType { get; set; } // e.g., "Type-C", "Type-A"
    public int? ActionRadiusKm { get; set; } // Specific for EVs
    public string? SpecialFeatures { get; set; } // E.g., "Tesla steering wheel indicators"
}