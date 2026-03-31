using Portfolio.Application.DTOs;

namespace Portfolio.Application.Interfaces.ExternalServices;

public interface IRdwService
{
    Task<RdwVehicleDto?> FetchVehicleDataAsync(string licensePlate); 
}