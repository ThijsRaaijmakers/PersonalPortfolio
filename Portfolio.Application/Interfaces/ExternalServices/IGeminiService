namespace Portfolio.Application.Interfaces.ExternalServices;

public interface IGeminiService
{
    // Takes the raw RDW data as context and asks the LLM to extract the hidden specs
    Task<string> EnrichVehicleDataAsync(string make, string model, int buildYear);
}