namespace Portfolio.Application.Interfaces.ExternalServices;

public interface IGeminiService
{
    Task<VehicleContextDto?> EnrichVehicleDataAsync(string make, string model, int buildYear);
}