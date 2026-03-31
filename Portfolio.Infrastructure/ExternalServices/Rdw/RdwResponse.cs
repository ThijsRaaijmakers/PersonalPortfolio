using System.Text.Json.Serialization;

namespace Portfolio.Infrastructure.ExternalServices.Rdw;

internal class RdwResponse
{
    [JsonPropertyName("merk")]
    public string Merk { get; set; } = string.Empty;

    [JsonPropertyName("handelsbenaming")]
    public string Handelsbenaming { get; set; } = string.Empty;

    [JsonPropertyName("datum_eerste_toelating")]
    public string DatumEersteToelating { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("variant")]
    public string Variant { get; set; } = string.Empty;

    [JsonPropertyName("uitvoering")]
    public string Uitvoering { get; set; } = string.Empty;
}