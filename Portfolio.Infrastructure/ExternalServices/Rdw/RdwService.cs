using System.Net.Http.Json;
using Portfolio.Application.DTOs;
using Portfolio.Application.Interfaces.ExternalServices;

namespace Portfolio.Infrastructure.ExternalServices.Rdw;

public class RdwService : IRdwService
{
    private readonly HttpClient _httpClient;

    public RdwService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<RdwVehicleDto?> FetchVehicleDataAsync(string licensePlate)
    {
        // RDW expects no dashes and uppercase letters (e.g., "AB123C")
        var cleanPlate = licensePlate.Replace("-", "").Replace(" ", "").ToUpperInvariant();

        // Fetch from the RDW Open Data API
        var response = await _httpClient.GetFromJsonAsync<RdwResponse[]>($"resource/m9d7-ebf2.json?kenteken={cleanPlate}");

        var vehicleData = response?.FirstOrDefault();

        if (vehicleData == null)
            return null; // License plate not found

        // Extract the build year from "YYYYMMDD" (DatumEersteToelating)
        int buildYear = 0;
        if (vehicleData.DatumEersteToelating.Length >= 4)
        {
            int.TryParse(vehicleData.DatumEersteToelating.Substring(0, 4), out buildYear);
        }

        // Return our clean Application DTO
        return new RdwVehicleDto
        {
            Make = vehicleData.Merk,
            Model = vehicleData.Handelsbenaming,
            BuildYear = buildYear,
            Type = vehicleData.Type,
            Variant = vehicleData.Variant,
            Uitvoering = vehicleData.Uitvoering
        };
    }
}