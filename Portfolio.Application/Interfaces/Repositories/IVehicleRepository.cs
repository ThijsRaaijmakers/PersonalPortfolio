using Portfolio.Domain.Entities;

namespace Portfolio.Application.Interfaces.Repositories;

public interface IVehicleRepository
{
    Task<Vehicle?> GetByLicensePlateAsync(string licensePlate);
    Task<IEnumerable<Vehicle>> GetAllAsync();
    Task AddAsync(Vehicle vehicle);
    Task UpdateAsync(Vehicle vehicle);
    Task DeleteAsync(Guid id);
}